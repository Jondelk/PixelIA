import {
  DAILY_MAX_PRIORITIES,
  DailyBriefGenerationSchema,
  type DailyBriefGeneration,
  type DailyContentSuggestion,
  type DailyFallbackReason,
  type DailyGeneration,
  type DailyGenerationMode,
  type DailyPriority,
  type FocusBlock,
} from '@pixel/contracts';
import { AIProviderError, type AIProvider } from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import {
  buildVocabulary,
  normalize,
  stem,
  unfoundedClaims,
  type Vocabulary,
} from '../content-plans/contentPlanning.grounding.js';
import type { DailyAnalysis, RefTarget } from './dailyAnalysis.js';
import {
  deterministicBrief,
  factualAction,
  factualContentSuggestion,
  factualFocusBlocks,
  factualRationale,
  toPriority,
  type BriefDraft,
} from './dailyFallback.js';

/*
 * DailyDirectorEngine: DailyAnalysis (hechos del backend) → BriefDraft.
 *
 *   sin trabajo registrado          → determinístico (no_work), sin llamar a la IA
 *   proveedor demo                  → determinístico (demo)
 *   IA real → Zod → referencias     → si alguna referencia no existe: determinístico (invalid_output)
 *           → textos no fundamentados (reuniones, horarios, cifras, nombres) → se sustituyen por
 *             la versión determinística de ese campo (sanitizedFields)
 *           → lo crítico nunca se omite (se añade a las prioridades si la IA lo dejó fuera)
 *   IA caída                        → determinístico (ai_unavailable)
 *
 * La IA interpreta y prioriza entre candidatos reales; el backend pone títulos, urgencias, minutos,
 * avisos y conteos. Nunca modifica tareas ni proyectos.
 */

export interface DailyDirectorResult {
  draft: BriefDraft;
  mode: DailyGenerationMode;
  generation: DailyGeneration;
}

export interface DailyDirectorEngine {
  generate(analysis: DailyAnalysis): Promise<DailyDirectorResult>;
}

export const DAILY_SCHEMA_NAME = 'daily_brief';

export const DAILY_SYSTEM = `Eres Pixel, el director creativo personal y coordinador de trabajo de esta persona. Cada
día lees el estado REAL de su trabajo (recibido en <daily_context>) y propones en qué concentrar la
atención hoy, qué puede esperar y cómo organizar el día. Son recomendaciones: no modificas nada.

Reglas:
- Prioridades (máximo 3, menos si no hay suficiente trabajo; nunca rellenes): elige entre los
  elementos del contexto por su "ref" (TASK_n, PROJECT_n, CONTENT_n). El backend ya los ordenó
  por urgencia ("score" y "signals"); puedes reordenar si su forma de trabajar o lo que quiere
  conseguir lo justifica, pero no ignores lo vencido o lo que vence hoy con prioridad alta.
- Cada prioridad necesita un rationale concreto apoyado en sus señales y en sus objetivos
  ("vence mañana y es de su proyecto en riesgo"), nunca "es importante".
- contentSuggestion: solo si le ayuda con contenido (style.contentRelevant) o hay contenido urgente.
  Prefiere un CONTENT_n existente; si no, un PLANITEM_n; si no, un PROJECT_n convertible. Nunca
  inventes una idea nueva. null si no aplica.
- focusBlocks: como máximo style.maxFocusBlocks, en orden; son bloques de enfoque, no horarios.
  Trabajo profundo = pocos bloques largos; sesiones cortas = varios bloques breves.
- summary: la primera frase debe ser útil y basada en hechos ("Hoy tienes dos entregas cercanas…").
  Nada de frases motivacionales vacías.
- Honestidad: no inventes reuniones, clientes, tareas, fechas, proyectos, publicaciones, métricas,
  horarios, tiempo disponible ni eventos. No uses horas del día ni duraciones (los minutos los pone
  el backend). Usa solo refs del contexto. No afirmes dependencias entre tareas que no conoces.
- Escribe en español, de tú, breve y con su tono.`;

/* ---------- Contexto para la IA ---------- */

function targetView(target: RefTarget) {
  return {
    ref: target.ref,
    title: target.title,
    score: target.score,
    urgency: target.urgency,
    signals: target.signals.map((signal) => signal.text),
    ...(target.estimatedMinutes ? { estimatedMinutes: target.estimatedMinutes } : {}),
    ...(target.contentStatus ? { status: target.contentStatus } : {}),
    ...(target.format ? { format: target.format } : {}),
  };
}

export function buildDailyPayload(analysis: DailyAnalysis) {
  const dna = analysis.dna;
  const byType = (type: RefTarget['type']) =>
    [...analysis.refs.values()].filter((target) => target.type === type).map(targetView);
  return {
    today: { localDate: analysis.day.today, timezone: analysis.day.timezone },
    person: {
      name: dna.identity.name,
      goals: dna.goals,
      workStyle: dna.workStyle,
      wantsHelpWith: dna.supportNeeds.wantsHelpWith,
      expectations: dna.supportNeeds.expectations,
      content: {
        themes: dna.contentIdentity.themes,
        formats: dna.contentIdentity.preferredFormats,
        platforms: dna.contentIdentity.platforms,
      },
      preferences: dna.preferences,
      restrictions: dna.restrictions,
      tone: dna.communication.tone,
    },
    style: {
      focusMode: analysis.focusMode,
      maxFocusBlocks: analysis.maxFocusBlocks,
      contentRelevant: analysis.helpAreas.content,
      helpWithProjects: analysis.helpAreas.projects,
      helpWithOrganization: analysis.helpAreas.organization,
    },
    facts: analysis.facts,
    warnings: analysis.warnings.map((warning) => warning.message),
    tasks: byType('task'),
    projects: byType('project'),
    content: byType('content'),
    planItems: byType('plan_item'),
    recentlyCompleted: analysis.recentCompleted,
  };
}

export function dailyPrompt(analysis: DailyAnalysis): string {
  return `Estado real del trabajo de hoy (JSON):\n<daily_context>\n${JSON.stringify(buildDailyPayload(analysis))}\n</daily_context>`;
}

/* ---------- Validación ---------- */

export class InvalidDailyOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDailyOutputError';
  }
}

/** Referencias estructurales: una sola desconocida invalida la salida entera. */
export function assertKnownRefs(output: DailyBriefGeneration, analysis: DailyAnalysis): void {
  const fail = (message: string) => {
    throw new InvalidDailyOutputError(message);
  };
  const seen = new Set<string>();
  for (const priority of output.priorities) {
    const target = analysis.refs.get(priority.ref);
    if (!target) fail(`Referencia desconocida: ${priority.ref}`);
    if (target!.type === 'plan_item') fail(`${priority.ref} no puede ser una prioridad`);
    if (seen.has(priority.ref)) fail(`Prioridad repetida: ${priority.ref}`);
    seen.add(priority.ref);
  }
  if (output.contentSuggestion && !analysis.refs.has(output.contentSuggestion.ref)) {
    fail(`Referencia desconocida: ${output.contentSuggestion.ref}`);
  }
  if (
    output.contentSuggestion &&
    analysis.refs.get(output.contentSuggestion.ref)!.type === 'task'
  ) {
    fail(`${output.contentSuggestion.ref} no es contenido`);
  }
  for (const block of output.focusBlocks) {
    if (block.ref && !analysis.refs.has(block.ref)) fail(`Referencia desconocida: ${block.ref}`);
  }
}

const EVENT_WORDS =
  /\b(reunion(es)?|llamadas?|videollamadas?|citas?|eventos?|meetings?|entrevistas?|juntas?|webinars?)\b/g;
const CLOCK_TIME = /\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b\d{1,2}\s?(am|pm)\b|\ba las \d/;
const DURATION = /\b(\d+)\s*(horas?|hrs?|minutos?|mins?)\b/;
const FREE_TIME =
  /\b(tiempo libre|tiempo disponible|tarde libre|manana libre|agenda libre|hueco libre|tienes libre|horas? libres?)\b/;

/** Afirmaciones que el Daily Director no puede hacer: eventos, horarios, tiempo disponible, cifras… */
export function dailyClaims(text: string | null | undefined, vocabulary: Vocabulary): string[] {
  if (!text) return [];
  const plain = normalize(text);
  const claims = unfoundedClaims(text, vocabulary);
  for (const match of plain.matchAll(EVENT_WORDS)) {
    if (!vocabulary.words.has(stem(match[1]!))) claims.push(match[0]);
  }
  if (CLOCK_TIME.test(plain)) claims.push(CLOCK_TIME.exec(plain)![0]);
  // Duraciones y tiempo disponible: nunca en texto (los minutos salen solo de estimatedMinutes).
  const duration = DURATION.exec(plain);
  if (duration) claims.push(duration[0]);
  if (FREE_TIME.test(plain)) claims.push(FREE_TIME.exec(plain)![0]);
  return claims;
}

const GENERIC_RATIONALE =
  /^(es|son|parece)?\s*(muy|bastante)?\s*(importante|urgente|prioritari[oa]|clave)s?\.?$/;

function eventVocabulary(analysis: DailyAnalysis): Vocabulary {
  const vocabulary = buildVocabulary([buildDailyPayload(analysis)]);
  // Las palabras de eventos solo valen si aparecen en títulos reales (p. ej. "Preparar reunión").
  for (const target of analysis.refs.values()) {
    for (const match of normalize(target.title).matchAll(EVENT_WORDS)) {
      vocabulary.words.add(stem(match[1]!));
    }
  }
  return vocabulary;
}

/** Combina la salida de la IA (ya con refs válidas) con los hechos del backend. */
export function mergeGeneratedBrief(
  output: DailyBriefGeneration,
  analysis: DailyAnalysis,
): { draft: BriefDraft; sanitizedFields: number } {
  const vocabulary = eventVocabulary(analysis);
  let sanitized = 0;
  const clean = (text: string | null | undefined) =>
    !text || dailyClaims(text, vocabulary).length === 0;
  const keep = <T>(value: T, ok: boolean, fallback: T): T => {
    if (ok) return value;
    sanitized += 1;
    return fallback;
  };

  let priorities: DailyPriority[] = output.priorities.map((entry, index) => {
    const target = analysis.refs.get(entry.ref)!;
    const rationale = entry.rationale.trim();
    const usable =
      clean(rationale) && !GENERIC_RATIONALE.test(normalize(rationale)) && rationale.length >= 20;
    return toPriority(
      target,
      index + 1,
      keep(rationale, usable, factualRationale(target)),
      keep(
        entry.suggestedAction?.trim() || factualAction(target),
        clean(entry.suggestedAction),
        factualAction(target),
      ),
    );
  });

  // Lo crítico nunca se omite ni queda detrás de algo menos urgente: si la IA lo dejó fuera,
  // entra primero (desplazando las últimas elegidas).
  const missingCritical = analysis.candidates
    .filter((target) => target.urgency === 'critical')
    .filter((target) => !priorities.some((priority) => priority.resourceId === target.id))
    .map((target) => toPriority(target, 0));
  if (missingCritical.length) {
    priorities = [...missingCritical, ...priorities];
    sanitized += missingCritical.length;
  }
  priorities = priorities
    .slice(0, DAILY_MAX_PRIORITIES)
    .map((priority, index) => ({ ...priority, rank: index + 1 }));

  let contentSuggestion: DailyContentSuggestion | null = null;
  const contentAllowed = analysis.helpAreas.content || analysis.urgentContent;
  if (output.contentSuggestion && contentAllowed) {
    const target = analysis.refs.get(output.contentSuggestion.ref)!;
    const factual = factualContentSuggestion(analysis, new Set());
    contentSuggestion = {
      contentItemId: target.type === 'content' ? target.id : null,
      contentPlanItemId: target.type === 'plan_item' ? target.id : null,
      contentPlanId: target.type === 'plan_item' ? (target.contentPlanId ?? null) : null,
      projectId: target.type === 'project' ? target.id : (target.projectId ?? null),
      title: target.type === 'project' ? `Contenido a partir de «${target.title}»` : target.title,
      reason: keep(
        output.contentSuggestion.reason.trim(),
        clean(output.contentSuggestion.reason),
        factual?.reason ?? factualRationale(target),
      ),
      suggestedAction: output.contentSuggestion.suggestedAction,
    };
  } else if (!output.contentSuggestion && analysis.urgentContent) {
    // Contenido vencido o para hoy/mañana: es un hecho que la persona fijó, no una idea de la IA.
    contentSuggestion = factualContentSuggestion(analysis, new Set());
  }

  const factualBlocks = factualFocusBlocks(analysis, priorities, contentSuggestion);
  const focusBlocks: FocusBlock[] = output.focusBlocks
    .slice(0, analysis.maxFocusBlocks)
    .map((block, index) => {
      const target = block.ref ? analysis.refs.get(block.ref) : undefined;
      const fallback = factualBlocks[index];
      const ok = clean(block.title) && clean(block.objective);
      if (!ok) sanitized += 1;
      // Un bloque con datos inventados se sustituye entero por el determinístico equivalente.
      if (!ok && fallback) return { ...fallback, order: index + 1 };
      return {
        order: index + 1,
        title: ok ? block.title.trim() : (fallback?.title ?? target?.title ?? 'Bloque de enfoque'),
        objective: ok ? block.objective.trim() : (fallback?.objective ?? 'Avanzar lo esencial.'),
        relatedResourceId: target?.id ?? null,
        relatedResourceType: target?.type ?? null,
        suggestedMinutes: target?.estimatedMinutes ?? null,
      };
    });

  const sentences = (text: string) =>
    text
      .split(/(?<=[.!?…])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  const keptSummary = sentences(output.summary).filter((sentence) => clean(sentence));
  if (keptSummary.length < sentences(output.summary).length) sanitized += 1;
  const factual = deterministicBrief(analysis);
  const closing = output.closingNote?.trim() || null;

  return {
    draft: {
      summary: keptSummary.length ? keptSummary.join(' ') : factual.summary,
      priorities,
      contentSuggestion,
      focusBlocks: focusBlocks.length ? focusBlocks : factualBlocks,
      closingNote: keep(closing, clean(closing), factual.closingNote),
    },
    sanitizedFields: sanitized,
  };
}

/* ---------- Engine ---------- */

const emptyGeneration = (fallbackReason: DailyFallbackReason | null): DailyGeneration => ({
  provider: null,
  model: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  fallbackReason,
  sanitizedFields: 0,
});

export function createDailyDirectorEngine(deps: {
  ai: AIProvider;
  logger: Logger;
}): DailyDirectorEngine {
  const fallback = (
    analysis: DailyAnalysis,
    reason: DailyFallbackReason,
    meta?: Partial<DailyGeneration>,
  ) => {
    deps.logger.info('daily_brief_fallback_used', { reason });
    return {
      draft: deterministicBrief(analysis),
      mode: 'deterministic' as const,
      generation: { ...emptyGeneration(reason), ...meta },
    };
  };

  return {
    async generate(analysis) {
      if (!analysis.hasWork) return fallback(analysis, 'no_work');
      if (deps.ai.mode === 'demo') return fallback(analysis, 'demo');

      let result;
      try {
        result = await deps.ai.generateStructuredOutput({
          system: DAILY_SYSTEM,
          prompt: dailyPrompt(analysis),
          schema: DailyBriefGenerationSchema,
          schemaName: DAILY_SCHEMA_NAME,
          maxOutputTokens: 4000,
          effort: 'medium',
        });
      } catch (err) {
        const kind = err instanceof AIProviderError ? err.kind : 'unavailable';
        deps.logger.warn('daily_brief_ai_failed', { kind });
        return fallback(
          analysis,
          kind === 'invalid_output' || kind === 'refused' ? 'invalid_output' : 'ai_unavailable',
        );
      }
      const meta = {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
      };
      const parsed = DailyBriefGenerationSchema.safeParse(result.data);
      if (!parsed.success) return fallback(analysis, 'invalid_output', meta);
      try {
        assertKnownRefs(parsed.data, analysis);
      } catch (err) {
        deps.logger.warn('daily_brief_invalid_refs', { message: (err as Error).message });
        return fallback(analysis, 'invalid_output', meta);
      }
      const { draft, sanitizedFields } = mergeGeneratedBrief(parsed.data, analysis);
      return {
        draft,
        mode: 'ai',
        generation: { ...emptyGeneration(null), ...meta, sanitizedFields },
      };
    },
  };
}
