import {
  BRAND_ARCHETYPES,
  CAMPAIGN_MAX_DELIVERABLES,
  GeneratedCampaignStrategySchema,
  type BrandDnaContent,
  type CampaignDeliverableType,
  type CampaignPillar,
  type GeneratedCampaignStrategy,
  type InsightType,
  type VisualDirection,
} from '@pixel/contracts';
import {
  AIProviderError,
  CAMPAIGN_SCHEMA_NAME,
  campaignPrompt,
  type AIProvider,
  type CampaignPayload,
  fold,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import { isNearDuplicate } from '../content-plans/contentPlanning.grounding.js';
import {
  campaignClaims,
  campaignVocabulary,
  conflictsWithRestrictions,
  forbiddenVisualStems,
  groundedCampaignText,
  insightSupportedBy,
  isClean,
  isPaletteColor,
  matchChannel,
} from './campaignStrategy.grounding.js';

/*
 * CampaignStrategyEngine: BrandDNA + brief + contexto acotado del workspace → estrategia de campaña
 * con sus piezas propuestas (sin persistir; el servicio guarda). Flujo:
 *   1. Contexto CONTROLADO (CampaignPayload): ADN, brief y listas cortas, sin ids ni documentos.
 *   2. AIProvider.generateStructuredOutput con GeneratedCampaignStrategySchema (Zod).
 *   3. Validación contra la realidad: sin cifras, clientes, claims ni productos inventados; dirección
 *      visual dentro de la paleta y de las restricciones; canales del brief; sin repetir campañas
 *      anteriores ni contenido reciente; el insight sin base se marca como hipótesis. Lo que no pasa
 *      se descarta o se recorta (y se cuenta); si no queda una estrategia usable → `failed`.
 * Sin IA disponible NO hay estrategia de respaldo (a diferencia del Daily Director): `unavailable`.
 */

/** Límites de contexto que se envían al modelo (rendimiento y foco). */
export const CAMPAIGN_CONTEXT_LIMITS = {
  recentCampaigns: 5,
  previousVersions: 5,
  activeProjects: 10,
  recentContent: 20,
} as const;

export interface CampaignBrief {
  objective: string;
  campaignType: string | null;
  productOrService: string | null;
  description: string | null;
  targetAudience: string[];
  problem: string | null;
  desiredOutcome: string | null;
  channels: string[];
  constraints: string[];
  mandatoryElements: string[];
  references: string[];
  startDate: string | null;
  endDate: string | null;
}

export interface CampaignStrategyInput {
  workspaceId: string;
  company: { name: string };
  brandDna: BrandDnaContent;
  brief: CampaignBrief;
  recentCampaigns: {
    name: string;
    objective: string;
    concept: string | null;
    keyMessage: string | null;
  }[];
  previousVersions: { bigIdea: string; concept: string; keyMessage: string }[];
  activeProjects: { name: string; type: string; status: string }[];
  recentContent: { title: string; platform: string | null; format: string | null }[];
  /** Prompt 16: memorias activas relevantes (CreativeMemoryResolver), ya ordenadas y acotadas. */
  creativeMemory?: { ref: string; statement: string; normalizedKey: string }[];
}

export interface ProposedDeliverable {
  title: string;
  description: string;
  type: CampaignDeliverableType;
  platform: string | null;
  format: string | null;
  objective: string | null;
  rationale: string;
}

export interface GroundedCampaignStrategy {
  strategicProblem: string;
  strategicOpportunity: string;
  insight: string;
  insightType: InsightType;
  bigIdea: string;
  concept: string;
  campaignNarrative: string;
  keyMessage: string;
  supportingMessages: string[];
  valueProposition: string | null;
  callToAction: string | null;
  tone: string[];
  visualDirection: VisualDirection;
  channels: string[];
  contentPillars: CampaignPillar[];
  rationale: string;
}

export interface CampaignStrategyProposal {
  strategy: GroundedCampaignStrategy;
  deliverables: ProposedDeliverable[];
  discardedDeliverables: number;
  discardedClaims: number;
  /** Prompt 16: memorias que cambiaron algo de la propuesta. */
  memoryKeys?: string[];
  meta: { provider: string; model: string; mode: 'ai' | 'demo' };
}

export type CampaignStrategyErrorKind = 'unavailable' | 'failed';

export class CampaignStrategyError extends Error {
  constructor(
    readonly kind: CampaignStrategyErrorKind,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CampaignStrategyError';
  }
}

export interface CampaignStrategyEngine {
  generate(input: CampaignStrategyInput): Promise<CampaignStrategyProposal>;
}

/* ---------- 1. Contexto controlado y prompt ---------- */

export function buildCampaignPayload(input: CampaignStrategyInput): CampaignPayload {
  const dna = input.brandDna;
  const c = dna.communication;
  return {
    brand: {
      name: input.company.name,
      industry: dna.identity.industry,
      description: dna.identity.description,
      story: dna.identity.story,
      origin: dna.identity.origin,
      essence: dna.identity.essence,
      mission: dna.purpose.mission,
      purpose: dna.purpose.purpose,
      values: dna.purpose.values,
      audience: {
        summary: dna.audience.summary,
        needs: dna.audience.needs,
        problems: dna.audience.problems,
        characteristics: dna.audience.characteristics,
      },
      personality: dna.personality.traits.map((trait) => trait.label),
      archetype: {
        id: dna.archetypes.primary.id,
        name: BRAND_ARCHETYPES[dna.archetypes.primary.id].name,
      },
      communication: {
        tone: c.tone,
        formality: c.formality.level,
        energy: c.energy.level,
        language: c.language.name,
        preferredWords: c.vocabulary.preferred,
        avoidWords: c.vocabulary.avoid,
        do: c.guidelines.do,
        dont: c.guidelines.dont,
      },
      visual: {
        palette: dna.visualLanguage.palette.map((color) => ({
          name: color.name,
          hex: color.hex,
          role: color.role,
        })),
        temperature: dna.visualLanguage.temperature,
        styles: dna.visualLanguage.styles,
        materials: dna.visualLanguage.materials,
        shapes: dna.visualLanguage.shapes,
        references: dna.visualLanguage.references,
        recurringElements: dna.visualLanguage.recurringElements,
      },
      differentiators: dna.differentiators.statements,
      competitors: dna.differentiators.competitors,
      likes: dna.creativePreferences.likes,
      dislikes: dna.creativePreferences.dislikes,
      visualReferences: dna.creativePreferences.visualReferences,
      restrictions: dna.restrictions,
    },
    brief: {
      objective: input.brief.objective,
      campaignType: input.brief.campaignType,
      productOrService: input.brief.productOrService,
      description: input.brief.description,
      targetAudience: input.brief.targetAudience,
      problem: input.brief.problem,
      desiredOutcome: input.brief.desiredOutcome,
      channels: input.brief.channels,
      constraints: input.brief.constraints,
      mandatoryElements: input.brief.mandatoryElements,
      references: input.brief.references,
      period: { startDate: input.brief.startDate, endDate: input.brief.endDate },
    },
    recentCampaigns: input.recentCampaigns.slice(0, CAMPAIGN_CONTEXT_LIMITS.recentCampaigns),
    previousVersions: input.previousVersions.slice(0, CAMPAIGN_CONTEXT_LIMITS.previousVersions),
    activeProjects: input.activeProjects.slice(0, CAMPAIGN_CONTEXT_LIMITS.activeProjects),
    recentContent: input.recentContent.slice(0, CAMPAIGN_CONTEXT_LIMITS.recentContent),
    creativeMemory: (input.creativeMemory ?? []).slice(0, 16).map((memory) => ({
      ref: memory.ref,
      statement: memory.statement,
      key: memory.normalizedKey,
    })),
  };
}

export const CAMPAIGN_SYSTEM = `Eres Pixel, el director creativo de esta marca. Conviertes una necesidad de negocio (el brief)
en una estrategia de campaña a partir EXCLUSIVAMENTE del contexto real que recibes: su ADN de marca
(brand), el brief, y listas cortas de campañas recientes, versiones anteriores, proyectos y contenido.

Criterio:
- La campaña nace del ADN: identidad, propósito, audiencia, personalidad, arquetipo, tono, lenguaje
  visual, diferenciadores, preferencias y restricciones. Nada genérico.
- rationale: explica por qué esta campaña representa a ESTA marca, citando rasgos concretos del ADN.
- Dirección visual: respeta brand.visual (paleta y el ROL de cada color: un acento sigue siendo un
  acento, nunca domina), creativePreferences y restrictions. En colors usa solo colores de la paleta.
  Nunca propongas lo que la marca evita.
- channels: si brief.channels tiene valores, usa SOLO esos. Si está vacío, sugiere pocos canales y
  justifícalos en rationale según la marca; no asumas Instagram, TikTok y YouTube para todas.
- deliverables: lo que la campaña necesita (2 a 8). type "content" para piezas de redes o contenido
  (reel, carrusel, post, stories…); "design", "video", "photo", "web", "print", "event" u "other" para
  producción que requiere un proyecto. platform: uno de los canales. Cada una con su rationale.
- No repitas el concepto, el nombre ni el mensaje de recentCampaigns ni de previousVersions, ni piezas
  de recentContent.
- Incluye brief.mandatoryElements y respeta brief.constraints.
- creativeMemory: preferencias y excepciones que el usuario confirmó (lo que Pixel ha aprendido).
  Úsalas como punto de partida (p. ej. sin CTA de urgencia, sin un formato que evita); si el brief
  pide otra cosa, manda el brief. Nunca son hechos: no fundamentan cifras, claims ni promociones.

Honestidad (obligatorio):
- Habla en propuesta («Podríamos construir el mensaje alrededor del origen»), nunca afirmes lo que no
  sabes del mercado o de los clientes.
- No inventes cifras, ventas, clientes, participación de mercado, precios, atributos del producto,
  ventajas, certificaciones, premios, ubicaciones, fechas, años de trayectoria ni claims. No uses
  nombres propios ni cifras que no estén en el contexto.
- insightType: "brand_derived" o "brief_derived" solo si el insight sale de ese contexto; si es una
  intuición tuya, "strategic_hypothesis" (no hay investigación de mercado detrás).

Escribe en español la explicación estratégica; keyMessage, supportingMessages y callToAction en el
idioma de la marca (brand.communication.language). Sé concreto.`;

/* ---------- 2. Validación contra la realidad ---------- */

export function groundCampaignStrategy(
  raw: GeneratedCampaignStrategy,
  payload: CampaignPayload,
): Omit<CampaignStrategyProposal, 'meta'> {
  const vocabulary = campaignVocabulary(payload);
  const forbidden = forbiddenVisualStems(payload);
  let discardedClaims = 0;

  const required = (label: string, text: string, hypothesis = false): string => {
    if (campaignClaims(text, vocabulary, { hypothesis }).length === 0) return text.trim();
    discardedClaims += 1;
    const kept = hypothesis
      ? text
          .split(/(?<=[.!?…])\s+/)
          .filter((sentence) => campaignClaims(sentence, vocabulary, { hypothesis }).length === 0)
          .join(' ')
          .trim()
      : groundedCampaignText(text, vocabulary);
    if (!kept) {
      throw new CampaignStrategyError('failed', `${label} no se apoya en el contexto real`);
    }
    return kept;
  };
  const optional = (text: string | null | undefined): string | null => {
    if (!text) return null;
    if (isClean(text, vocabulary)) return text.trim();
    discardedClaims += 1;
    return null;
  };
  const cleanList = (values: string[], extra: (value: string) => boolean = () => true) => {
    const kept: string[] = [];
    for (const value of values) {
      const text = value.trim();
      if (!text || kept.some((other) => other.toLowerCase() === text.toLowerCase())) continue;
      if (isClean(text, vocabulary) && extra(text)) kept.push(text);
      else discardedClaims += 1;
    }
    return kept;
  };
  const visualOk = (value: string) => !conflictsWithRestrictions(value, forbidden);

  const concept = required('El concepto', raw.concept);
  const keyMessage = required('El mensaje principal', raw.keyMessage);
  const bigIdea = required('La big idea', raw.bigIdea);

  // Sin duplicación evidente frente a campañas recientes y versiones anteriores.
  const previousConcepts = [
    ...payload.recentCampaigns.map((campaign) => campaign.concept ?? ''),
    ...payload.previousVersions.map((version) => version.concept),
  ].filter(Boolean);
  const previousMessages = [
    ...payload.recentCampaigns.map((campaign) => campaign.keyMessage ?? ''),
    ...payload.previousVersions.map((version) => version.keyMessage),
  ].filter(Boolean);
  if (isNearDuplicate(concept, previousConcepts) || isNearDuplicate(keyMessage, previousMessages)) {
    throw new CampaignStrategyError(
      'failed',
      'La estrategia repite el concepto o el mensaje de una campaña anterior',
    );
  }

  // El insight: si no se apoya en el ADN o el brief, es una hipótesis (y así se muestra).
  const insight = required('El insight', raw.insight, true);
  const brand = payload.brand;
  const brief = payload.brief;
  const brandSources = [
    brand.audience.summary,
    ...brand.audience.needs,
    ...brand.audience.problems,
    brand.purpose,
    brand.essence,
    ...brand.differentiators,
  ];
  const briefSources = [
    brief.problem,
    brief.desiredOutcome,
    brief.description,
    brief.objective,
  ].filter((value): value is string => Boolean(value));
  const insightType: InsightType =
    raw.insightType === 'brand_derived' && insightSupportedBy(insight, brandSources)
      ? 'brand_derived'
      : raw.insightType === 'brief_derived' && insightSupportedBy(insight, briefSources)
        ? 'brief_derived'
        : 'strategic_hypothesis';

  const avoidWords = brand.communication.avoidWords.map((word) => word.toLowerCase());
  const tone = cleanList(raw.tone, (value) => !avoidWords.includes(value.toLowerCase()));

  // Canales: los del brief mandan; sin brief, los sugeridos (limpios).
  const channels = brief.channels.length
    ? [
        ...new Set(
          raw.channels
            .map((channel) => matchChannel(channel, brief.channels))
            .filter((channel): channel is string => channel !== null),
        ),
      ]
    : cleanList(raw.channels);
  const finalChannels = channels.length ? channels : brief.channels;

  const visual = raw.visualDirection;
  const avoidSet = new Map<string, string>();
  for (const value of [...visual.avoid, ...brand.restrictions.visual, ...brand.dislikes]) {
    const text = value.trim();
    if (text && isClean(text, vocabulary)) avoidSet.set(text.toLowerCase(), text);
  }
  const visualDirection: VisualDirection = {
    mood: cleanList(visual.mood, visualOk),
    colors: cleanList(visual.colors, (value) => visualOk(value) && isPaletteColor(value, payload)),
    materials: cleanList(visual.materials, visualOk),
    composition: cleanList(visual.composition, visualOk),
    photography: cleanList(visual.photography, visualOk),
    motion: cleanList(visual.motion, visualOk),
    avoid: [...avoidSet.values()].slice(0, 12),
  };

  const contentPillars: CampaignPillar[] = [];
  for (const pillar of raw.contentPillars) {
    if (isClean(pillar.name, vocabulary) && isClean(pillar.purpose, vocabulary)) {
      contentPillars.push({ name: pillar.name.trim(), purpose: pillar.purpose.trim() });
    } else discardedClaims += 1;
  }

  // Piezas: limpias, coherentes con la dirección visual, en los canales del brief y sin repetir.
  let discardedDeliverables = 0;
  const deliverables: ProposedDeliverable[] = [];
  // Repetición: contra el contenido reciente, por similitud; entre piezas de esta misma estrategia,
  // solo la copia exacta (mismo título y canal): dos formatos de un mismo concepto no son duplicados.
  const history = payload.recentContent.map((item) => item.title);
  const keys = new Set<string>();
  const keyOf = (title: string, platform: string | null) =>
    `${title.trim().toLowerCase()}|${platform?.toLowerCase() ?? ''}`;
  for (const item of raw.deliverables) {
    const texts = [
      item.title,
      item.description,
      item.objective,
      item.rationale,
      item.platform,
      item.format,
    ];
    let platform = item.platform?.trim() || null;
    if (platform && brief.channels.length) platform = matchChannel(platform, brief.channels);
    const offChannel = Boolean(item.platform?.trim()) && platform === null;
    if (
      offChannel ||
      !texts.every((text) => isClean(text, vocabulary)) ||
      !visualOk(`${item.title} ${item.description}`) ||
      isNearDuplicate(item.title, history) ||
      keys.has(keyOf(item.title, platform))
    ) {
      discardedDeliverables += 1;
      continue;
    }
    keys.add(keyOf(item.title, platform));
    deliverables.push({
      title: item.title.trim(),
      description: item.description.trim(),
      type: item.type,
      platform,
      format: item.format?.trim() || null,
      objective: item.objective?.trim() || null,
      rationale: item.rationale.trim(),
    });
  }
  if (deliverables.length === 0) {
    throw new CampaignStrategyError('failed', 'Ninguna pieza propuesta superó la validación');
  }
  const supportingMessages = cleanList(raw.supportingMessages);
  if (supportingMessages.length === 0) {
    throw new CampaignStrategyError('failed', 'Ningún mensaje secundario se apoya en el ADN');
  }

  return {
    strategy: {
      strategicProblem: required('El problema estratégico', raw.strategicProblem),
      strategicOpportunity: required('La oportunidad', raw.strategicOpportunity),
      insight,
      insightType,
      bigIdea,
      concept,
      campaignNarrative: required('La narrativa', raw.campaignNarrative),
      keyMessage,
      supportingMessages,
      valueProposition: optional(raw.valueProposition),
      callToAction: optional(raw.callToAction),
      tone: tone.length ? tone : brand.communication.tone.slice(0, 3),
      visualDirection,
      channels: finalChannels,
      contentPillars,
      rationale: required('El porqué de la campaña', raw.rationale),
    },
    deliverables: deliverables.slice(0, CAMPAIGN_MAX_DELIVERABLES),
    discardedDeliverables:
      discardedDeliverables + Math.max(0, deliverables.length - CAMPAIGN_MAX_DELIVERABLES),
    discardedClaims,
  };
}

/* ---------- Engine ---------- */

export function createCampaignStrategyEngine(deps: {
  ai: AIProvider;
  logger: Logger;
}): CampaignStrategyEngine {
  return {
    async generate(input) {
      const payload = buildCampaignPayload(input);
      let result: Awaited<ReturnType<AIProvider['generateStructuredOutput']>> & {
        data: GeneratedCampaignStrategy;
      };
      try {
        result = await deps.ai.generateStructuredOutput({
          system: CAMPAIGN_SYSTEM,
          prompt: campaignPrompt(payload),
          schema: GeneratedCampaignStrategySchema,
          schemaName: CAMPAIGN_SCHEMA_NAME,
          maxOutputTokens: 8_000,
          effort: 'medium',
        });
      } catch (err) {
        deps.logger.warn('Campaign Manager: el proveedor de IA no generó la estrategia', { err });
        if (
          err instanceof AIProviderError &&
          (err.kind === 'invalid_output' || err.kind === 'refused')
        ) {
          throw new CampaignStrategyError(
            'failed',
            'Pixel no pudo construir una estrategia válida',
            err,
          );
        }
        throw new CampaignStrategyError(
          'unavailable',
          'La generación de campañas no está disponible',
          err,
        );
      }
      const parsed = GeneratedCampaignStrategySchema.safeParse(result.data);
      if (!parsed.success) {
        throw new CampaignStrategyError('failed', 'La estrategia generada no cumple el esquema');
      }
      const grounded = applyCampaignMemories(groundCampaignStrategy(parsed.data, payload), payload);
      if (grounded.discardedDeliverables > 0 || grounded.discardedClaims > 0) {
        deps.logger.info('Campaign Manager: elementos descartados por la validación', {
          workspaceId: input.workspaceId,
          discardedDeliverables: grounded.discardedDeliverables,
          discardedClaims: grounded.discardedClaims,
        });
      }
      return {
        ...grounded,
        meta: { provider: result.provider, model: result.model, mode: result.mode },
      };
    },
  };
}

/* ---------- 3. Lo que Pixel ha aprendido (Prompt 16) ---------- */

const URGENT_CTA =
  /\b(?:compra(?:lo)? ya|ya mismo|ahora o nunca|ultimas unidades|no te lo pierdas|solo hoy|corre|apurate|date prisa|por tiempo limitado)\b/;
const SHOUTED_CTA = /!{2,}|(?<!\p{L})[A-ZÁÉÍÓÚÑ]{4,}(?!\p{L})/u;

/**
 * Aplica las memorias de forma determinista DESPUÉS de la validación de fundamento, con proveedor real
 * o demo: el brief siempre manda (si lo pide, se respeta). Así Pixel no vuelve a proponer lo que el
 * usuario ya corrigió para que el Guardian tenga que señalarlo otra vez. Nunca añade hechos.
 */
export function applyCampaignMemories(
  proposal: Omit<CampaignStrategyProposal, 'meta'>,
  payload: CampaignPayload,
): Omit<CampaignStrategyProposal, 'meta'> & { memoryKeys: string[] } {
  const keys = new Set(payload.creativeMemory.map((memory) => memory.key));
  const applied = new Set<string>();
  const brief = fold(
    [
      payload.brief.objective,
      payload.brief.description ?? '',
      ...payload.brief.constraints,
      ...payload.brief.mandatoryElements,
      ...payload.brief.channels,
    ].join(' '),
  );
  const strategy = { ...proposal.strategy };
  if (keys.has('communication:urgency:avoid')) {
    applied.add('communication:urgency:avoid');
    const cta = strategy.callToAction;
    const urgent = (text: string) => URGENT_CTA.test(fold(text)) || SHOUTED_CTA.test(text);
    if (cta && urgent(cta) && !urgent(payload.brief.objective)) {
      strategy.callToAction = 'Descúbrelo';
    }
  }
  const avoided = (kind: 'format' | 'platform') =>
    [...keys]
      .map((key) => key.split(':'))
      .filter(([dimension, , polarity]) => dimension === kind && polarity === 'avoid')
      .map(([, subject]) => subject!);
  const avoidFormats = avoided('format').filter((format) => !brief.includes(formatWord(format)));
  const avoidPlatforms = avoided('platform').filter((platform) => !brief.includes(platform));
  const kept = proposal.deliverables.filter((deliverable) => {
    const format = fold(deliverable.format ?? '');
    const platform = fold(deliverable.platform ?? '');
    const hitFormat = avoidFormats.find((f) => format.includes(formatWord(f)));
    const hitPlatform = avoidPlatforms.find((p) => platform.includes(p));
    if (hitFormat) applied.add(`format:${hitFormat}:avoid`);
    if (hitPlatform) applied.add(`platform:${hitPlatform}:avoid`);
    return !hitFormat && !hitPlatform;
  });
  if (avoidPlatforms.length) {
    strategy.channels = strategy.channels.filter(
      (channel) => !avoidPlatforms.some((p) => fold(channel).includes(p)),
    );
    if (!strategy.channels.length) strategy.channels = proposal.strategy.channels;
  }
  const visualAvoid = [...keys]
    .map((key) => key.split(':'))
    .filter(([dimension, , polarity]) => dimension === 'visual' && polarity === 'avoid');
  if (visualAvoid.length) {
    const labels = payload.creativeMemory
      .filter((memory) => memory.key.startsWith('visual:') && memory.key.endsWith(':avoid'))
      .map((memory) => memory.statement);
    strategy.visualDirection = {
      ...strategy.visualDirection,
      avoid: [...new Set([...strategy.visualDirection.avoid, ...labels])].slice(0, 12),
    };
    for (const memory of payload.creativeMemory) {
      if (memory.key.startsWith('visual:') && memory.key.endsWith(':avoid'))
        applied.add(memory.key);
    }
  }
  return {
    ...proposal,
    strategy,
    // Si la memoria dejaría la campaña sin piezas, se conservan: nunca se rompe la generación.
    deliverables: kept.length ? kept : proposal.deliverables,
    memoryKeys: [...applied],
  };
}

const FORMAT_WORDS: Record<string, string> = {
  story: 'stor',
  reel: 'reel',
  carousel: 'carrusel',
  photo: 'foto',
  short_video: 'video',
  long_video: 'video',
  article: 'articulo',
  podcast: 'podcast',
  newsletter: 'newsletter',
};
const formatWord = (format: string) => FORMAT_WORDS[format] ?? format;
