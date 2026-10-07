import {
  BRAND_ARCHETYPES,
  BrandArchetypeSchema,
  PersonalDnaContentSchema,
  PersonalOnboardingSchema,
  type BrandArchetype,
  type PersonalDnaContent,
  type PersonalOnboardingInput,
} from '@pixel/contracts';
import { z } from 'zod';
import type { AIProvider } from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import { traitArchetypes } from './personalDna.lexicon.js';

/*
 * PersonalDnaGenerator: onboarding personal → PersonalDNA (sin persistencia; el servicio guarda).
 *
 * 1. Reglas determinísticas: cada campo del ADN sale de una respuesta concreta. Lo que la persona no
 *    contó queda vacío (null / []); nunca se rellena con suposiciones.
 * 2. Enriquecimiento IA opcional (solo con un modelo real): salida estructurada validada con Zod y
 *    limitada a tres huecos — resumen (si no hay bio ni titular), fortalezas y arquetipos (si los
 *    rasgos no los revelan). Cada propuesta se contrasta con las respuestas y se descarta si no se
 *    apoya en ellas. Si la IA falla, queda el resultado determinístico.
 */

/** Cambia esta versión si cambian las reglas: forzará una versión nueva del ADN. */
export const PERSONAL_DNA_GENERATOR_VERSION = 'personal-rules-1';
const AI_SUFFIX = '+ai';
const MAX_ARCHETYPES = 2;

export interface GeneratedPersonalDna {
  content: PersonalDnaContent;
  generator: { kind: 'deterministic' | 'ai'; version: string };
}

export interface PersonalDnaGenerator {
  /** Versión de las reglas (con `+ai` si enriquece con IA). Forma parte del hash de origen. */
  readonly version: string;
  generate(input: PersonalOnboardingInput): Promise<GeneratedPersonalDna>;
}

/** Une listas sin duplicados (sin distinguir mayúsculas), conservando el orden. */
function unique(...lists: (readonly (string | null | undefined)[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of lists.flat()) {
    const value = item?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const ARCHETYPE_ORDER = Object.keys(BRAND_ARCHETYPES) as BrandArchetype[];

/** Hasta 2 arquetipos, solo a partir de los rasgos elegidos (los primeros pesan más). */
export function archetypesFromTraits(traits: readonly string[]): BrandArchetype[] {
  const scores = new Map<BrandArchetype, number>();
  traits.forEach((trait, index) => {
    const weight = 1 - (index / Math.max(traits.length, 1)) * 0.5;
    for (const [archetype, affinity] of Object.entries(traitArchetypes(trait)) as [
      BrandArchetype,
      number,
    ][]) {
      scores.set(archetype, (scores.get(archetype) ?? 0) + affinity * weight);
    }
  });
  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort(([a, x], [b, y]) => y - x || ARCHETYPE_ORDER.indexOf(a) - ARCHETYPE_ORDER.indexOf(b))
    .slice(0, MAX_ARCHETYPES)
    .map(([id]) => id);
}

/** Reglas puras: mismas respuestas → mismo ADN. */
export function generatePersonalDnaContent(rawInput: PersonalOnboardingInput): PersonalDnaContent {
  const input = PersonalOnboardingSchema.parse(rawInput);
  const { identity, goals, audience, personality, communication, creative, contentWork, support } =
    input;

  return PersonalDnaContentSchema.parse({
    identity: {
      name: identity.name,
      professionalIdentity: unique([identity.profession], identity.roles),
      summary: identity.bio ?? identity.headline ?? null,
      interests: identity.interests,
    },
    professionalProfile: {
      roles: identity.roles,
      skills: identity.skills,
      // Sin pregunta que los respalde: vacíos salvo enriquecimiento IA verificado (fortalezas).
      industries: [],
      strengths: [],
    },
    goals: {
      professional: goals.professional,
      personal: goals.personal,
      content: goals.content,
      shortTerm: goals.shortTerm,
      longTerm: goals.longTerm,
    },
    audience: {
      primaryAudience: audience.primaryAudience ?? null,
      secondaryAudiences: audience.secondaryAudiences,
      needs: audience.needs,
      problems: audience.problems,
      desiredPerception: audience.desiredPerception,
    },
    personality: {
      traits: personality.traits,
      archetypes: archetypesFromTraits(personality.traits),
    },
    communication: {
      tone: communication.tone,
      formality: communication.formality,
      energy: communication.energy,
      language: communication.language,
      preferredWords: communication.preferredWords,
      avoidWords: communication.avoidWords,
    },
    creativeIdentity: {
      styles: creative.styles,
      colors: creative.colors.map((color) => ({ hex: color.hex, name: color.name ?? null })),
      references: creative.references,
      visualPreferences: creative.visualPreferences,
      avoidVisuals: creative.avoidVisuals,
    },
    contentIdentity: {
      themes: contentWork.content.themes,
      preferredFormats: contentWork.content.formats,
      platforms: contentWork.content.platforms,
      frequencyPreference: contentWork.content.frequency ?? null,
    },
    workStyle: {
      preferredWorkTimes: contentWork.work.preferredWorkTimes,
      planningStyle: contentWork.work.planningStyle,
      executionStyle: contentWork.work.executionStyle,
      focusStyle: contentWork.work.focusStyle,
      productivityPreferences: contentWork.work.productivityPreferences,
    },
    supportNeeds: {
      wantsHelpWith: support.wantsHelpWith,
      expectations: support.expectations ?? null,
    },
    preferences: unique(creative.visualPreferences, contentWork.work.productivityPreferences),
    restrictions: unique(
      creative.avoidVisuals.map((item) => `Evitar visualmente: ${item}`),
      communication.avoidWords.map((word) => `No usar «${word}»`),
    ),
  });
}

// ---------- Enriquecimiento IA (opcional y verificado) ----------

export const PersonalDnaEnrichmentSchema = z.object({
  summary: z.string().trim().max(400).nullable(),
  strengths: z.array(z.string().trim().min(2).max(80)).max(5),
  archetypes: z.array(BrandArchetypeSchema).max(MAX_ARCHETYPES),
});
export type PersonalDnaEnrichment = z.infer<typeof PersonalDnaEnrichmentSchema>;

const ENRICH_SYSTEM = `Eres el analista de Pixel, un director creativo personal. Recibes las respuestas
reales de una persona a su onboarding. Devuelve SOLO lo que se deduce directamente de ellas:
- summary: 1–2 frases en segunda persona que resuman quién es y qué busca, usando sus propias
  palabras. null si no hay base suficiente.
- strengths: hasta 5 fortalezas que aparezcan en sus habilidades, roles, rasgos o en cómo quiere
  que la perciban. Nada que no esté respaldado por sus respuestas.
- archetypes: hasta 2 arquetipos de la lista cerrada que encajen con sus rasgos. [] si no está claro.
Nunca inventes datos, cifras, logros, clientes ni experiencia. Ante la duda, deja el campo vacío.`;

/** Palabras con contenido (≥ 4 letras), normalizadas y sin terminaciones de género/número. */
function contentWords(textValue: string): string[] {
  return textValue
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length >= 4)
    .map((word) => (word.length > 5 ? word.replace(/(as|os|es|a|o|e|s)$/, '') : word));
}

/** Vocabulario de las respuestas (solo valores escritos o elegidos, no los nombres de campo). */
function vocabularyOf(input: PersonalOnboardingInput): Set<string> {
  const values: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
  };
  collect(input);
  return new Set(values.flatMap(contentWords));
}

/** Una fortaleza se acepta solo si comparte vocabulario con las respuestas. */
function isGrounded(candidate: string, vocabulary: Set<string>, minRatio: number): boolean {
  const words = contentWords(candidate);
  if (words.length === 0) return false;
  const hits = words.filter((word) => vocabulary.has(word)).length;
  return hits > 0 && hits / words.length >= minRatio;
}

/** Aplica solo las propuestas de la IA que se apoyan en las respuestas reales. */
export function applyEnrichment(
  base: PersonalDnaContent,
  enrichment: PersonalDnaEnrichment,
  input: PersonalOnboardingInput,
): { content: PersonalDnaContent; applied: boolean } {
  const vocabulary = vocabularyOf(input);
  let applied = false;
  const content: PersonalDnaContent = structuredClone(base);

  if (!content.identity.summary && enrichment.summary) {
    if (isGrounded(enrichment.summary, vocabulary, 0.5)) {
      content.identity.summary = enrichment.summary;
      applied = true;
    }
  }

  const strengths = unique(
    enrichment.strengths.filter((strength) => isGrounded(strength, vocabulary, 0.5)),
  );
  if (content.professionalProfile.strengths.length === 0 && strengths.length > 0) {
    content.professionalProfile.strengths = strengths;
    applied = true;
  }

  if (content.personality.archetypes.length === 0 && content.personality.traits.length > 0) {
    const archetypes = [...new Set(enrichment.archetypes)].slice(0, MAX_ARCHETYPES);
    if (archetypes.length > 0) {
      content.personality.archetypes = archetypes;
      applied = true;
    }
  }

  return { content: PersonalDnaContentSchema.parse(content), applied };
}

export function createPersonalDnaGenerator(deps: {
  ai: AIProvider;
  logger: Logger;
}): PersonalDnaGenerator {
  const useAi = deps.ai.mode === 'ai';
  const version = useAi
    ? `${PERSONAL_DNA_GENERATOR_VERSION}${AI_SUFFIX}`
    : PERSONAL_DNA_GENERATOR_VERSION;

  return {
    version,
    async generate(rawInput) {
      const input = PersonalOnboardingSchema.parse(rawInput);
      const content = generatePersonalDnaContent(input);
      const deterministic: GeneratedPersonalDna = {
        content,
        generator: { kind: 'deterministic', version },
      };
      if (!useAi) return deterministic;

      try {
        const archetypeList = ARCHETYPE_ORDER.map(
          (id) => `${id} (${BRAND_ARCHETYPES[id].name})`,
        ).join(', ');
        const { data } = await deps.ai.generateStructuredOutput({
          system: ENRICH_SYSTEM,
          prompt: `Arquetipos posibles: ${archetypeList}.\n\nRespuestas del onboarding (JSON):\n${JSON.stringify(input)}`,
          schema: PersonalDnaEnrichmentSchema,
          schemaName: 'personal_dna_enrichment',
          maxOutputTokens: 800,
          effort: 'low',
        });
        const enriched = applyEnrichment(content, PersonalDnaEnrichmentSchema.parse(data), input);
        return enriched.applied
          ? { content: enriched.content, generator: { kind: 'ai', version } }
          : deterministic;
      } catch (err) {
        deps.logger.warn('PersonalDNA: enriquecimiento IA no disponible, se usan las reglas', {
          err,
        });
        return deterministic;
      }
    },
  };
}
