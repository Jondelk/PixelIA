import {
  BRAND_ARCHETYPES,
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
 *    limitada a dos huecos — resumen (si no hay bio ni titular) y fortalezas. Cada propuesta debe
 *    apoyarse por completo en las respuestas (todas sus palabras y cifras); si no, se descarta.
 *    Si la IA falla, queda el resultado determinístico.
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
  /** true si intenta enriquecer con un modelo real (si falla, guarda el resultado de reglas). */
  readonly usesAi: boolean;
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

/*
 * La IA solo puede proponer un resumen (si no hay bio ni frase) y fortalezas. Los arquetipos NO se
 * delegan: salen únicamente de los rasgos (si Pixel no reconoce ninguno, quedan vacíos).
 * Verificación estricta: TODAS las palabras con contenido y TODAS las cifras de una propuesta deben
 * aparecer en las respuestas; si sobra una sola ("premiada", "Cannes", "500"), se descarta entera.
 */
export const PersonalDnaEnrichmentSchema = z.object({
  summary: z.string().trim().max(400).nullable(),
  strengths: z.array(z.string().trim().min(2).max(80)).max(5),
});
export type PersonalDnaEnrichment = z.infer<typeof PersonalDnaEnrichmentSchema>;

const ENRICH_SYSTEM = `Eres el analista de Pixel, un director creativo personal. Recibes las respuestas
reales de una persona a su onboarding. Devuelve SOLO lo que dicen sus respuestas, con sus palabras:
- summary: 1–2 frases en segunda persona que resuman quién es y qué busca, usando exclusivamente
  palabras de sus respuestas. null si no hay base suficiente.
- strengths: hasta 5 fortalezas tomadas de sus habilidades, roles, rasgos o de cómo quiere que la
  perciban, con las mismas palabras. [] si no hay.
Nunca añadas datos, cifras, lugares, premios, logros, clientes ni experiencia. Ante la duda, vacío.`;

/** Palabras de enlace que una frase de resumen puede usar sin que estén en las respuestas. */
const CONNECTORS = new Set(
  [
    'eres',
    'quieres',
    'buscas',
    'trabajas',
    'ayudas',
    'haces',
    'creas',
    'tienes',
    'hablas',
    'dedicas',
    'quiere',
    'busca',
    'trabaja',
    'ayuda',
    'hace',
    'crea',
    'tiene',
    'habla',
    'dedica',
    'persona',
    'alguien',
    'para',
    'como',
    'desde',
    'entre',
    'sobre',
    'hacia',
    'hasta',
    'donde',
    'cuando',
    'mientras',
    'tambien',
    'ademas',
    'pero',
    'porque',
    'cada',
    'todo',
    'toda',
    'todos',
    'todas',
    'esta',
    'este',
    'estos',
    'estas',
    'tus',
    'sus',
    'con',
    'que',
    'una',
    'unos',
    'unas',
    'mas',
    'muy',
    'manera',
    'forma',
  ].map((word) => stem(word)),
);

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Raíz de una palabra (sin terminaciones de género/número). */
function stem(word: string): string {
  return word.length > 5 ? word.replace(/(as|os|es|a|o|e|s)$/, '') : word;
}

/** Palabras con contenido (≥ 4 letras, por su raíz) y cifras (todas, de cualquier longitud). */
function tokens(textValue: string): { words: string[]; numbers: string[] } {
  const parts = normalizeText(textValue)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
  return {
    words: parts.filter((part) => /[a-zñ]/.test(part) && part.length >= 4).map(stem),
    numbers: parts.filter((part) => /\d/.test(part)),
  };
}

/** Vocabulario de las respuestas (solo valores escritos o elegidos, no los nombres de campo). */
function vocabularyOf(input: PersonalOnboardingInput): Set<string> {
  const values: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') values.push(value);
    else if (typeof value === 'number') values.push(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
  };
  collect(input);
  return new Set(
    values.flatMap((value) => {
      const { words, numbers } = tokens(value);
      return [...words, ...numbers];
    }),
  );
}

/**
 * Una propuesta se acepta solo si cada palabra con contenido y cada cifra aparece en las respuestas
 * (los conectores de una frase quedan exentos) y al menos una palabra se apoya en ellas.
 */
export function isGrounded(
  candidate: string,
  vocabulary: Set<string>,
  options: { allowConnectors: boolean },
): boolean {
  const { words, numbers } = tokens(candidate);
  const content = options.allowConnectors ? words.filter((word) => !CONNECTORS.has(word)) : words;
  if (content.length === 0) return false;
  return (
    content.every((word) => vocabulary.has(word)) &&
    numbers.every((number) => vocabulary.has(number))
  );
}

/** Aplica solo las propuestas de la IA que se apoyan por completo en las respuestas reales. */
export function applyEnrichment(
  base: PersonalDnaContent,
  enrichment: PersonalDnaEnrichment,
  input: PersonalOnboardingInput,
): { content: PersonalDnaContent; applied: boolean } {
  const vocabulary = vocabularyOf(input);
  let applied = false;
  const content: PersonalDnaContent = structuredClone(base);

  if (
    !content.identity.summary &&
    enrichment.summary &&
    isGrounded(enrichment.summary, vocabulary, { allowConnectors: true })
  ) {
    content.identity.summary = enrichment.summary;
    applied = true;
  }

  const strengths = unique(
    enrichment.strengths.filter((strength) =>
      isGrounded(strength, vocabulary, { allowConnectors: false }),
    ),
  );
  if (content.professionalProfile.strengths.length === 0 && strengths.length > 0) {
    content.professionalProfile.strengths = strengths;
    applied = true;
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
    usesAi: useAi,
    async generate(rawInput) {
      const input = PersonalOnboardingSchema.parse(rawInput);
      const content = generatePersonalDnaContent(input);
      const deterministic: GeneratedPersonalDna = {
        content,
        generator: { kind: 'deterministic', version },
      };
      if (!useAi) return deterministic;

      try {
        const { data } = await deps.ai.generateStructuredOutput({
          system: ENRICH_SYSTEM,
          prompt: `Respuestas del onboarding (JSON):\n${JSON.stringify(input)}`,
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
