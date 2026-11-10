import {
  CREATIVE_MEMORY_KEY,
  CreativeMemoryDimensionSchema,
  GeneratedCreativeMemorySynthesisSchema,
  type CreativeMemoryDimension,
  type CreativeMemoryKind,
  type GeneratedCreativeMemorySynthesis,
} from '@pixel/contracts';
import {
  fold,
  MEMORY_SYNTHESIS_SCHEMA_NAME,
  MEMORY_SYSTEM,
  memoryPrompt,
  type MemoryPayload,
} from '../../ai/index.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  CreativeDecisionEventModel,
  type CreativeDecisionEventDocument,
} from './creativeDecisionEvent.model.js';
import { CreativeMemoryModel } from './creativeMemory.model.js';
import { memoryRuntime } from './creativeMemory.runtime.js';
import { memoryRejection, parseMemoryKey, subjectOf, subjectsIn } from './memory.lexicon.js';
import { COPY_EDIT_KEY } from './memory.signals.js';

/*
 * CreativeMemorySynthesizer (docs/CREATIVE-MEMORY.md §8). Solo para ediciones de texto libre que las
 * reglas no saben resumir (`communication:copy_edit`), y solo con evidencia suficiente: ≥ 3 ediciones
 * independientes, aún no usadas por otra memoria, en ≥ 2 recursos. Nunca por un único evento. Una
 * llamada como máximo por síntesis (cada 3 ediciones nuevas). La IA ve EVENT_n, nunca ids; su salida
 * se valida contra los eventos y, si no queda evidencia válida, no se crea nada.
 */

const MIN_EVENTS = 3;
const MIN_RESOURCES = 2;
const MAX_EVENTS = 12;

const textOf = (event: CreativeDecisionEventDocument) =>
  [...event.before, ...event.after].map((entry) => entry.value).join('\n');

const resourceKey = (event: CreativeDecisionEventDocument) =>
  (event.contentPlanId ?? event.resourceId)?.toString() ?? event.sourceEventKey;

const VAGUE = /\b(?:le gusta lo|es una persona|es muy|es creativ\w*|tiene buen gusto|le encanta)\b/;

export interface ValidatedSynthesis {
  key: string;
  dimension: CreativeMemoryDimension;
  kind: CreativeMemoryKind;
  statement: string;
  confidence: number;
  events: CreativeDecisionEventDocument[];
}

/**
 * Valida la salida contra los eventos que se enviaron (pura, para tests):
 * - referencias desconocidas (EVENT_999) fuera; con menos de 3 válidas en 2 recursos, nada;
 * - la clave debe ser `dimension:tema:prefer|avoid` y coherente con la dimensión;
 * - todo tema del léxico que nombre el enunciado o la clave debe aparecer en los eventos citados
 *   ("prefiere TikTok" cuando solo quitaron Stories → rechazada);
 * - nunca hechos, credenciales ni (Personal) datos sensibles; nunca enunciados vagos.
 */
export function validateSynthesis(
  output: GeneratedCreativeMemorySynthesis,
  refs: Map<string, CreativeDecisionEventDocument>,
  contextType: 'personal' | 'enterprise',
): ValidatedSynthesis | null {
  if (!output.shouldCreateCandidate || !output.statement || !output.normalizedKey) return null;
  const events = [...new Set(output.evidenceRefs)]
    .map((ref) => refs.get(ref))
    .filter((event): event is CreativeDecisionEventDocument => Boolean(event));
  if (events.length < MIN_EVENTS || new Set(events.map(resourceKey)).size < MIN_RESOURCES) {
    return null;
  }
  const key = output.normalizedKey.trim().toLowerCase();
  const parsed = CREATIVE_MEMORY_KEY.test(key) ? parseMemoryKey(key) : null;
  if (!parsed || (parsed.polarity !== 'prefer' && parsed.polarity !== 'avoid')) return null;
  const dimension = CreativeMemoryDimensionSchema.safeParse(parsed.dimension);
  if (!dimension.success) return null;
  if (output.dimension && output.dimension !== parsed.dimension) return null;

  const statement = output.statement.trim();
  if (memoryRejection(statement, contextType) || VAGUE.test(fold(statement))) return null;
  if (statement.split(/\s+/).length < 4) return null;

  const evidenceText = fold(events.map(textOf).join('\n'));
  const named = [
    ...subjectsIn(statement),
    ...(subjectOf(parsed.dimension, parsed.subject)
      ? [subjectOf(parsed.dimension, parsed.subject)!]
      : []),
  ];
  for (const subject of named) {
    if (!new RegExp(`\\b(?:${subject.pattern})\\b`).test(evidenceText)) return null;
  }
  const kind: CreativeMemoryKind =
    output.kind &&
    output.kind !== 'decision' &&
    output.kind !== 'insight' &&
    output.kind !== 'rejection'
      ? output.kind
      : 'preference';
  return {
    key,
    dimension: dimension.data,
    kind,
    statement: statement.slice(0, 200),
    confidence: Math.min(0.8, output.confidence ?? 0.6),
    events,
  };
}

export async function synthesizeCopyEdits(workspace: WorkspaceDocument): Promise<void> {
  const { ai, logger } = memoryRuntime();
  if (!ai) return;
  const events = await CreativeDecisionEventModel.find({
    workspaceId: workspace._id,
    'signals.normalizedKey': COPY_EDIT_KEY,
    'metadata.influencedByMemory': { $ne: true },
  })
    .sort({ occurredAt: -1 })
    .limit(MAX_EVENTS * 2);
  if (events.length < MIN_EVENTS) return;

  // Ediciones ya usadas por otra memoria (o descartadas con ella) no vuelven a contar.
  const used = await CreativeMemoryModel.find({
    workspaceId: workspace._id,
    origin: 'decision_pattern',
    evidenceEventIds: { $in: events.map((e) => e._id) },
  }).select({ evidenceEventIds: 1 });
  const consumed = new Set(used.flatMap((m) => (m.evidenceEventIds ?? []).map(String)));
  const fresh = events.filter((e) => !consumed.has(e._id.toString())).slice(0, MAX_EVENTS);
  if (
    fresh.length < MIN_EVENTS ||
    fresh.length % MIN_EVENTS !== 0 ||
    new Set(fresh.map(resourceKey)).size < MIN_RESOURCES
  ) {
    return;
  }

  const refs = new Map(fresh.map((event, index) => [`EVENT_${index + 1}`, event]));
  const payload: MemoryPayload = {
    contextType: workspace.type,
    events: [...refs].map(([ref, event]) => ({
      ref,
      description: event.description,
      before: event.before.map(({ field, value }) => ({ field, value })),
      after: event.after.map(({ field, value }) => ({ field, value })),
    })),
  };
  let output: GeneratedCreativeMemorySynthesis;
  try {
    const result = await ai.generateStructuredOutput({
      system: MEMORY_SYSTEM,
      prompt: memoryPrompt(payload),
      schema: GeneratedCreativeMemorySynthesisSchema,
      schemaName: MEMORY_SYNTHESIS_SCHEMA_NAME,
      maxOutputTokens: 800,
      effort: 'low',
    });
    output = GeneratedCreativeMemorySynthesisSchema.parse(result.data);
  } catch (err) {
    logger.warn('creative_memory_synthesis_failed', { workspaceId: workspace._id.toString(), err });
    return;
  }
  const valid = validateSynthesis(output, refs, workspace.type);
  if (!valid) {
    logger.info('creative_memory_synthesis_discarded', { workspaceId: workspace._id.toString() });
    return;
  }
  const duplicate = await CreativeMemoryModel.exists({
    workspaceId: workspace._id,
    normalizedKey: valid.key,
    status: { $in: ['active', 'candidate'] },
  });
  if (duplicate) return;
  const resources = new Set(valid.events.map(resourceKey)).size;
  try {
    await CreativeMemoryModel.create({
      workspaceId: workspace._id,
      memoryScope: workspace.type,
      kind: valid.kind,
      content: valid.statement,
      createdByUserId: workspace.ownerId,
      active: false,
      status: 'candidate',
      origin: 'decision_pattern',
      dimension: valid.dimension,
      normalizedKey: valid.key,
      polarity: valid.key.endsWith(':avoid') ? 'avoid' : 'prefer',
      value: null,
      scope: { type: 'workspace', id: null, label: null },
      confidence: valid.confidence,
      occurrenceCount: valid.events.length,
      evidenceCount: valid.events.length,
      evidenceEventIds: valid.events.map((e) => e._id),
      evidenceSummary: `En ${valid.events.length} textos de ${resources} recursos diferentes hiciste cambios parecidos.`,
      confirmedByUser: false,
      lastObservedAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: unknown }).code !== 11000) throw err;
  }
}
