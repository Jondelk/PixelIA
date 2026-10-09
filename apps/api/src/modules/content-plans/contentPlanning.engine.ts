import {
  CONTENT_PLAN_DEFAULT_FREQUENCY,
  CONTENT_PLAN_MAX_ITEMS,
  GeneratedContentPlanSchema,
  type ContentAngle,
  type ContentFormat,
  type ContentItem,
  type ContentPillar,
  type ContentPlatform,
  type GeneratedContentPlan,
  type PersonalDnaContent,
  type Project,
} from '@pixel/contracts';
import {
  AIProviderError,
  PLANNING_SCHEMA_NAME,
  planningPrompt,
  type AIProvider,
  type PlanningPayload,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import {
  buildVocabulary,
  daysOf,
  dayToInstant,
  formatFromText,
  frequencyFromText,
  groundedSentences,
  isNearDuplicate,
  platformFromText,
  spreadDays,
  unfoundedClaims,
  uniqueValues,
  type Vocabulary,
} from './contentPlanning.grounding.js';

/*
 * ContentPlanningEngine: PersonalDNA + Projects + historial de contenido + plan previo → propuesta
 * de plan (sin persistir; el servicio guarda). Flujo:
 *   1. Normaliza la petición: plataformas permitidas, formatos preferidos, frecuencia y fechas.
 *   2. Construye un contexto CONTROLADO (PlanningPayload) y llama a AIProvider.generateStructuredOutput
 *      con GeneratedContentPlanSchema (Zod).
 *   3. Valida el resultado contra la realidad: sin datos inventados, solo plataformas permitidas,
 *      proyectos reales, fechas del periodo, sin duplicados evidentes, formatos preferidos y ángulos
 *      variados. Lo que no pasa se descarta (y se cuenta), nunca se "arregla" inventando.
 * No modifica proyectos ni crea tareas: solo lee.
 */

/** Límites de contexto que se envían al modelo (rendimiento y foco). */
export const PLANNING_CONTEXT_LIMITS = {
  activeProjects: 10,
  recentContent: 30,
  previousProposals: 40,
} as const;

export interface ContentPlanningInput {
  workspaceId: string;
  personalDna: PersonalDnaContent;
  /** Proyectos activos o planificados (ya limitados). */
  activeProjects: Project[];
  /** Contenido reciente del workspace (ya limitado). */
  recentContent: ContentItem[];
  /** Propuestas de planes anteriores (para no repetirlas; las rechazadas también cuentan). */
  previousProposals: { title: string; status: string }[];
  requestedPeriod: { startDate: string; endDate: string };
  desiredFrequency?: number;
  requestedPlatforms?: ContentPlatform[];
  requestedGoal?: string;
  tzOffset: number;
}

export interface ProposedPlanItem {
  title: string;
  concept: string;
  rationale: string;
  objective: string;
  audience: string[];
  platform: ContentPlatform;
  format: ContentFormat;
  pillar: string | null;
  angle: ContentAngle;
  hook: string | null;
  suggestedAngle: string | null;
  scheduledFor: Date;
  projectId: string | null;
}

export interface ContentPlanProposal {
  strategySummary: string;
  pillars: ContentPillar[];
  items: ProposedPlanItem[];
  platforms: ContentPlatform[];
  targetAudience: string[];
  discardedItems: number;
  frequencyPerWeek: number;
  frequencySource: 'request' | 'personal_dna' | 'default';
  meta: { provider: string; model: string; mode: 'ai' | 'demo' };
}

export type ContentPlanningErrorKind = 'unavailable' | 'failed' | 'platforms_missing';

export class ContentPlanningError extends Error {
  constructor(
    readonly kind: ContentPlanningErrorKind,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ContentPlanningError';
  }
}

export interface ContentPlanningEngine {
  plan(input: ContentPlanningInput): Promise<ContentPlanProposal>;
}

/* ---------- 1. Petición normalizada ---------- */

export interface PlanningRequest {
  days: string[];
  itemCount: number;
  frequencyPerWeek: number;
  frequencySource: ContentPlanProposal['frequencySource'];
  allowedPlatforms: ContentPlatform[];
  preferredFormats: ContentFormat[];
}

export function resolvePlanningRequest(input: ContentPlanningInput): PlanningRequest {
  const content = input.personalDna.contentIdentity;
  const allowedPlatforms = input.requestedPlatforms?.length
    ? uniqueValues(input.requestedPlatforms)
    : uniqueValues(content.platforms.map(platformFromText));
  if (allowedPlatforms.length === 0) {
    throw new ContentPlanningError(
      'platforms_missing',
      'Indica al menos una plataforma: tu ADN personal no declara ninguna',
    );
  }
  const fromDna = frequencyFromText(content.frequencyPreference);
  const [frequencyPerWeek, frequencySource] = input.desiredFrequency
    ? [input.desiredFrequency, 'request' as const]
    : fromDna
      ? [fromDna, 'personal_dna' as const]
      : [CONTENT_PLAN_DEFAULT_FREQUENCY, 'default' as const];
  const days = daysOf(input.requestedPeriod.startDate, input.requestedPeriod.endDate);
  const itemCount = Math.min(
    CONTENT_PLAN_MAX_ITEMS,
    Math.max(1, Math.round((frequencyPerWeek * days.length) / 7)),
  );
  return {
    days,
    itemCount,
    frequencyPerWeek,
    frequencySource,
    allowedPlatforms,
    preferredFormats: uniqueValues(content.preferredFormats.map(formatFromText)),
  };
}

/* ---------- 2. Contexto controlado y prompt ---------- */

export function buildPlanningPayload(
  input: ContentPlanningInput,
  request: PlanningRequest,
): PlanningPayload {
  const dna = input.personalDna;
  return {
    persona: {
      name: dna.identity.name,
      professionalIdentity: dna.identity.professionalIdentity,
      summary: dna.identity.summary,
      interests: dna.identity.interests,
      roles: dna.professionalProfile.roles,
      skills: dna.professionalProfile.skills,
      strengths: dna.professionalProfile.strengths,
      goals: dna.goals,
      audience: dna.audience,
      personality: dna.personality,
      communication: dna.communication,
      creative: {
        styles: dna.creativeIdentity.styles,
        references: dna.creativeIdentity.references,
        visualPreferences: dna.creativeIdentity.visualPreferences,
        avoidVisuals: dna.creativeIdentity.avoidVisuals,
      },
      content: dna.contentIdentity,
      supportNeeds: dna.supportNeeds,
      preferences: dna.preferences,
      restrictions: dna.restrictions,
    },
    projects: input.activeProjects
      .slice(0, PLANNING_CONTEXT_LIMITS.activeProjects)
      .map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.type,
        status: project.status,
        goals: project.goals,
        dueDate: project.dueDate,
      })),
    recentContent: input.recentContent
      .slice(0, PLANNING_CONTEXT_LIMITS.recentContent)
      .map((item) => ({
        title: item.title,
        hook: item.hook,
        platform: item.platform,
        format: item.format,
        status: item.status,
      })),
    previousProposals: input.previousProposals.slice(0, PLANNING_CONTEXT_LIMITS.previousProposals),
    request: {
      startDate: input.requestedPeriod.startDate,
      endDate: input.requestedPeriod.endDate,
      days: request.days,
      itemCount: request.itemCount,
      allowedPlatforms: request.allowedPlatforms,
      preferredFormats: request.preferredFormats,
      goal: input.requestedGoal?.trim() || null,
    },
  };
}

export const PLANNING_SYSTEM = `Eres Pixel, el director creativo personal de esta persona. Construyes con ella una
estrategia de contenido para un periodo concreto, a partir EXCLUSIVAMENTE del contexto real que recibes
(su ADN personal, sus proyectos activos, su contenido reciente y su petición).

Criterio:
- Nada genérico. Cada propuesta nace de su identidad, sus objetivos, su audiencia definida, su tono, su
  estilo y sus temas. Prohibido el relleno tipo "frase motivacional" o "5 consejos para…".
- Si hay proyectos reales que encajan con sus objetivos, conviértelos en contenido (proceso, caso,
  detrás de cámara…) y pon su id en projectId. Si no hay, usa su ADN; nunca inventes proyectos.
- Deriva de 2 a 5 pilares de contenido propios de esta persona (no una lista estándar) y reparte las
  propuestas entre ellos según sus objetivos y su audiencia.
- Varía los ángulos (education, opinion, process, case, behind_the_scenes, reflection, portfolio,
  comparison, storytelling) cuando sean coherentes con ella.
- platform: SOLO una de request.allowedPlatforms. format: prioriza request.preferredFormats; otro
  formato solo con una razón clara.
- suggestedDate: un día de request.days (AAAA-MM-DD). Exactamente request.itemCount propuestas.
- No repitas temas, hooks ni ángulos de recentContent ni de previousProposals.
- rationale: por qué Pixel lo recomienda, conectando la pieza con un objetivo, su audiencia o un
  proyecto concreto.

Honestidad (obligatorio):
- Habla en propuesta ("Para tu audiencia definida, propondría…"), nunca afirmes lo que no sabes
  ("tu audiencia prefiere…").
- No inventes métricas, seguidores, resultados, clientes, marcas, colaboraciones, experiencias, años
  de trayectoria, premios ni fechas. No uses nombres propios ni cifras que no estén en el contexto.
- Respeta sus restricciones y las palabras que evita.

Escribe en español, en segunda persona, con su tono. strategySummary: 2–4 frases.`;

/* ---------- 3. Validación contra la realidad ---------- */

export interface GroundingContext {
  request: PlanningRequest;
  vocabulary: Vocabulary;
  projectIds: Set<string>;
  /** Títulos y hooks que no deben repetirse. */
  history: string[];
  tzOffset: number;
}

export function groundingContextFor(
  input: ContentPlanningInput,
  request: PlanningRequest,
  payload: PlanningPayload,
): GroundingContext {
  return {
    request,
    vocabulary: buildVocabulary([payload]),
    projectIds: new Set(payload.projects.map((project) => project.id)),
    history: [
      ...input.recentContent.flatMap((item) => [item.title, item.hook ?? '']),
      ...input.previousProposals.map((proposal) => proposal.title),
    ].filter(Boolean),
    tzOffset: input.tzOffset,
  };
}

/**
 * Aplica las reglas de fundamento a la salida (ya validada con Zod) del modelo. Descarta lo que no
 * pasa; lanza `failed` si no queda una estrategia o ninguna propuesta utilizable.
 */
export function groundGeneratedPlan(
  raw: GeneratedContentPlan,
  context: GroundingContext,
): Pick<ContentPlanProposal, 'strategySummary' | 'pillars' | 'items' | 'discardedItems'> {
  const { vocabulary, request } = context;
  const clean = (text: string | null | undefined) => unfoundedClaims(text, vocabulary).length === 0;

  const strategySummary = groundedSentences(raw.strategySummary, vocabulary);
  if (!strategySummary) {
    throw new ContentPlanningError(
      'failed',
      'La estrategia propuesta no se apoya en tu contexto real',
    );
  }

  const pillars: ContentPillar[] = [];
  for (const pillar of raw.pillars) {
    const name = pillar.name.trim();
    if (!name || !clean(name) || !clean(pillar.rationale)) continue;
    if (pillars.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) continue;
    pillars.push({ name, rationale: pillar.rationale.trim() });
  }

  let discarded = 0;
  const kept: (Omit<ProposedPlanItem, 'scheduledFor'> & { day: string | null })[] = [];
  const seen: string[] = [...context.history];
  for (const item of raw.items) {
    const texts = [
      item.title,
      item.concept,
      item.rationale,
      item.objective,
      item.hook,
      item.suggestedAngle,
      item.pillar,
      ...item.audience,
    ];
    const allowed = request.allowedPlatforms.includes(item.platform);
    // Títulos: ni repetidos del historial ni entre sí. Hooks: solo contra el historial (dos
    // hooks parecidos en piezas distintas no son una pieza repetida).
    const duplicate =
      isNearDuplicate(item.title, seen) ||
      (item.hook ? isNearDuplicate(item.hook, context.history) : false);
    if (!allowed || duplicate || !texts.every(clean)) {
      discarded += 1;
      continue;
    }
    seen.push(item.title);
    const pillar = pillars.find(
      (existing) => existing.name.toLowerCase() === item.pillar.trim().toLowerCase(),
    );
    kept.push({
      title: item.title.trim(),
      concept: item.concept.trim(),
      rationale: item.rationale.trim(),
      objective: item.objective.trim(),
      audience: item.audience.map((entry) => entry.trim()).filter(Boolean),
      platform: item.platform,
      format: item.format,
      pillar: pillar?.name ?? null,
      angle: item.angle,
      hook: item.hook?.trim() || null,
      suggestedAngle: item.suggestedAngle?.trim() || null,
      projectId: item.projectId && context.projectIds.has(item.projectId) ? item.projectId : null,
      day:
        item.suggestedDate && request.days.includes(item.suggestedDate) ? item.suggestedDate : null,
    });
  }

  // Preferencias de formato: un formato alternativo cabe, pero no puede dominar el plan.
  let balanced = kept;
  if (request.preferredFormats.length > 0) {
    const maxAlternative = Math.max(1, Math.floor(Math.min(kept.length, request.itemCount) / 3));
    let alternatives = 0;
    balanced = kept.filter((item) => {
      if (request.preferredFormats.includes(item.format)) return true;
      alternatives += 1;
      return alternatives <= maxAlternative;
    });
  }
  // Variedad de ángulos: ninguno ocupa más de la mitad de un plan de 4 o más piezas.
  if (balanced.length >= 4) {
    const maxPerAngle = Math.ceil(Math.min(balanced.length, request.itemCount) / 2);
    const perAngle = new Map<ContentAngle, number>();
    balanced = balanced.filter((item) => {
      const count = (perAngle.get(item.angle) ?? 0) + 1;
      perAngle.set(item.angle, count);
      return count <= maxPerAngle;
    });
  }
  const selected = balanced.slice(0, request.itemCount);
  discarded += kept.length - selected.length;
  if (selected.length === 0) {
    throw new ContentPlanningError('failed', 'Ninguna propuesta superó la validación');
  }

  const fallbackDays = spreadDays(request.days, selected.length);
  const items = selected
    .map(({ day, ...item }, index) => {
      const chosen = day ?? fallbackDays[index]!;
      return { ...item, scheduledFor: dayToInstant(chosen, context.tzOffset), day: chosen };
    })
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    .map(({ day: _day, ...item }) => item);

  return { strategySummary, pillars, items, discardedItems: discarded };
}

/* ---------- Engine ---------- */

export function createContentPlanningEngine(deps: {
  ai: AIProvider;
  logger: Logger;
}): ContentPlanningEngine {
  return {
    async plan(input) {
      const request = resolvePlanningRequest(input);
      const payload = buildPlanningPayload(input, request);
      let result: Awaited<ReturnType<AIProvider['generateStructuredOutput']>> & {
        data: GeneratedContentPlan;
      };
      try {
        result = await deps.ai.generateStructuredOutput({
          system: PLANNING_SYSTEM,
          prompt: planningPrompt(payload),
          schema: GeneratedContentPlanSchema,
          schemaName: PLANNING_SCHEMA_NAME,
          maxOutputTokens: 12_000,
          effort: 'medium',
        });
      } catch (err) {
        deps.logger.warn('Content Planner: el proveedor de IA no generó el plan', { err });
        if (
          err instanceof AIProviderError &&
          (err.kind === 'invalid_output' || err.kind === 'refused')
        ) {
          throw new ContentPlanningError('failed', 'Pixel no pudo construir un plan válido', err);
        }
        throw new ContentPlanningError(
          'unavailable',
          'La generación de planes no está disponible',
          err,
        );
      }
      const parsed = GeneratedContentPlanSchema.safeParse(result.data);
      if (!parsed.success) {
        throw new ContentPlanningError('failed', 'El plan generado no cumple el esquema');
      }
      const grounded = groundGeneratedPlan(
        parsed.data,
        groundingContextFor(input, request, payload),
      );
      if (grounded.discardedItems > 0) {
        deps.logger.info('Content Planner: propuestas descartadas por la validación', {
          discarded: grounded.discardedItems,
        });
      }
      const dna = input.personalDna;
      return {
        ...grounded,
        platforms: uniqueValues(grounded.items.map((item) => item.platform)),
        targetAudience: [dna.audience.primaryAudience, ...dna.audience.secondaryAudiences].filter(
          (value): value is string => Boolean(value),
        ),
        frequencyPerWeek: request.frequencyPerWeek,
        frequencySource: request.frequencySource,
        meta: { provider: result.provider, model: result.model, mode: result.mode },
      };
    },
  };
}
