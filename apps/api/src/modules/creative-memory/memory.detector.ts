import {
  CREATIVE_MEMORY_MAX_EVIDENCE,
  type CompactDecisionSnapshot,
  type CreativeDecisionEventType,
  type CreativeMemoryOrigin,
  type CreativeSignal,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { hasWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import {
  CreativeDecisionEventModel,
  type CreativeDecisionEventDocument,
} from './creativeDecisionEvent.model.js';
import { CreativeMemoryModel, type CreativeMemoryDocument } from './creativeMemory.model.js';
import { memoryRuntime } from './creativeMemory.runtime.js';
import { kindFor, parseMemoryKey, statementFor, subjectOf } from './memory.lexicon.js';
import { COPY_EDIT_KEY, SIGNAL_WEIGHT } from './memory.signals.js';
import { synthesizeCopyEdits } from './memory.synthesizer.js';

/*
 * Registro de decisiones + CreativeMemoryPatternDetector (docs/CREATIVE-MEMORY.md §5–§7).
 *
 * recordCreativeDecision se llama desde la capa de servicios DESPUÉS de la acción principal y es
 * best-effort: si falla, la acción del usuario ya ocurrió y no se deshace (solo se registra en el
 * log). Nada de change streams ni middleware que adivine intenciones.
 *
 * El detector, por cada clave de la decisión:
 *   1. si ya hay una memoria activa o candidata con esa clave y alcance → la refuerza (sin duplicar);
 *   2. si no, cuenta las decisiones INDEPENDIENTES (fuerza media/alta, no influidas por una memoria)
 *      posteriores al último olvido o descarte de esa clave (anti-reaprendizaje);
 *   3. con ≥ 3 decisiones en ≥ 2 recursos distintos crea una memoria CANDIDATA. Nunca activa.
 */

export const PATTERN_MIN_SIGNALS = 3;
export const PATTERN_MIN_RESOURCES = 2;

export interface DecisionInput {
  eventType: CreativeDecisionEventType;
  resourceType?: string | null;
  resourceId?: Types.ObjectId | string | null;
  campaignId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  contentPlanId?: Types.ObjectId | string | null;
  signals?: CreativeSignal[];
  before?: CompactDecisionSnapshot;
  after?: CompactDecisionSnapshot;
  /** Idempotencia: la misma acción repetida produce UN solo evento. */
  sourceEventKey: string;
  description: string;
  metadata?: {
    source?: string | null;
    dimension?: string | null;
    reason?: string | null;
    influencedByMemory?: boolean;
  };
}

const oid = (value: Types.ObjectId | string | null | undefined) =>
  value ? new Types.ObjectId(value.toString()) : null;

const isDuplicate = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/** Registra una decisión (idempotente, best-effort). Devuelve null si ya existía o si falló. */
export async function recordCreativeDecision(
  workspace: WorkspaceDocument,
  input: DecisionInput,
): Promise<CreativeDecisionEventDocument | null> {
  if (!hasWorkspaceFeature(workspace, 'creativeMemory')) return null;
  const { logger } = memoryRuntime();
  let event: CreativeDecisionEventDocument;
  try {
    event = await CreativeDecisionEventModel.create({
      workspaceId: workspace._id,
      contextType: workspace.type,
      eventType: input.eventType,
      resourceType: input.resourceType ?? null,
      resourceId: oid(input.resourceId),
      campaignId: oid(input.campaignId),
      projectId: oid(input.projectId),
      contentPlanId: oid(input.contentPlanId),
      actorUserId: workspace.ownerId,
      signals: input.signals ?? [],
      before: input.before ?? [],
      after: input.after ?? [],
      sourceEventKey: input.sourceEventKey.slice(0, 200),
      description: input.description.slice(0, 300),
      metadata: {
        source: input.metadata?.source ?? null,
        dimension: input.metadata?.dimension ?? null,
        reason: input.metadata?.reason?.slice(0, 200) ?? null,
        influencedByMemory: input.metadata?.influencedByMemory ?? false,
      },
      occurredAt: new Date(),
    });
  } catch (err) {
    if (isDuplicate(err)) return null;
    logger.warn('creative_memory_capture_failed', {
      workspaceId: workspace._id.toString(),
      eventType: input.eventType,
      err,
    });
    return null;
  }
  logger.info('creative_decision_recorded', {
    workspaceId: workspace._id.toString(),
    eventType: event.eventType,
    signals: event.signals.map((s) => s.normalizedKey),
    influencedByMemory: event.metadata.influencedByMemory,
  });
  try {
    await detectPatterns(workspace, event);
  } catch (err) {
    logger.warn('creative_memory_detection_failed', {
      workspaceId: workspace._id.toString(),
      err,
    });
  }
  return event;
}

/* ---------- Detector ---------- */

type Scope = { type: 'workspace' | 'campaign'; id: Types.ObjectId | null; label: string | null };

const resourceKey = (event: CreativeDecisionEventDocument) =>
  (event.contentPlanId ?? event.resourceId ?? event.campaignId)?.toString() ?? event.sourceEventKey;

const independentSignal = (event: CreativeDecisionEventDocument, key: string) =>
  event.metadata.influencedByMemory
    ? null
    : (event.signals.find(
        (s) => s.normalizedKey === key && SIGNAL_WEIGHT[s.strength] >= SIGNAL_WEIGHT.medium,
      ) ?? null);

/** Confianza de una candidata derivada (interna, no es una certeza): crece con evidencia. */
export function derivedConfidence(signals: number, resources: number, strong: number): number {
  const value = 0.35 + 0.1 * signals + 0.05 * (resources - 1) + 0.05 * strong;
  return Math.round(Math.min(0.85, value) * 100) / 100;
}

/** Cubre la memoria a la decisión: workspace siempre; campaña solo si es la misma. */
const covers = (memory: CreativeMemoryDocument, event: CreativeDecisionEventDocument) =>
  !memory.scope ||
  memory.scope.type === 'workspace' ||
  (memory.scope.type === 'campaign' &&
    memory.scope.id?.toString() === event.campaignId?.toString());

export async function detectPatterns(
  workspace: WorkspaceDocument,
  event: CreativeDecisionEventDocument,
): Promise<void> {
  if (event.metadata.influencedByMemory) return;
  const keys = [...new Set(event.signals.map((s) => s.normalizedKey))];
  for (const key of keys) {
    if (key === COPY_EDIT_KEY) await synthesizeCopyEdits(workspace);
    else await detectKey(workspace, key, event);
  }
}

async function detectKey(
  workspace: WorkspaceDocument,
  key: string,
  event: CreativeDecisionEventDocument,
): Promise<void> {
  const parsed = parseMemoryKey(key);
  const subject = parsed ? subjectOf(parsed.dimension, parsed.subject) : null;
  if (!parsed || !subject) return;

  const memories = await CreativeMemoryModel.find({
    workspaceId: workspace._id,
    normalizedKey: key,
  });

  // 1. Refuerzo: la evidencia nueva se suma a la memoria existente (sin crear un duplicado).
  const existing = memories.find(
    (m) => (m.status === 'active' || m.status === 'candidate') && covers(m, event),
  );
  if (existing) {
    if (existing.evidenceEventIds?.some((id) => id.equals(event._id))) return;
    await CreativeMemoryModel.updateOne(
      { _id: existing._id, workspaceId: workspace._id },
      {
        $inc: { evidenceCount: 1, occurrenceCount: 1 },
        $push: { evidenceEventIds: { $each: [event._id], $slice: -CREATIVE_MEMORY_MAX_EVIDENCE } },
        $set: { lastObservedAt: new Date() },
      },
    );
    return;
  }

  // 2. Anti-reaprendizaje: solo cuenta lo posterior al último olvido o descarte de esta clave.
  const cutoff = memories.reduce<Date>((latest, m) => {
    const at = [m.forgottenAt, m.dismissedAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return at && at > latest ? at : latest;
  }, new Date(0));

  const events = await CreativeDecisionEventModel.find({
    workspaceId: workspace._id,
    'signals.normalizedKey': key,
    occurredAt: { $gt: cutoff },
  })
    .sort({ occurredAt: -1 })
    .limit(50);
  const independent = events.filter((e) => independentSignal(e, key));
  const resources = new Set(independent.map(resourceKey));
  if (independent.length < PATTERN_MIN_SIGNALS || resources.size < PATTERN_MIN_RESOURCES) return;

  // 3. Candidata. Si todas las decisiones son de la misma campaña, el patrón es de esa campaña.
  const campaigns = new Set(independent.map((e) => e.campaignId?.toString() ?? 'none'));
  const campaignId = campaigns.size === 1 ? independent[0]!.campaignId : null;
  const scope: Scope = campaignId
    ? { type: 'campaign', id: campaignId, label: null }
    : { type: 'workspace', id: null, label: null };
  const strong = independent.filter((e) => independentSignal(e, key)?.strength === 'high').length;
  const origin: CreativeMemoryOrigin = independent.every((e) => e.eventType.startsWith('guardian_'))
    ? 'guardian'
    : independent.every((e) => e.eventType === 'pixel_command_adjusted')
      ? 'pixel_command'
      : 'decision_pattern';
  const evidence = independent.slice(0, CREATIVE_MEMORY_MAX_EVIDENCE);
  try {
    await CreativeMemoryModel.create({
      workspaceId: workspace._id,
      memoryScope: workspace.type,
      kind: kindFor(parsed.dimension, parsed.polarity),
      content: statementFor(subject, parsed.polarity),
      createdByUserId: workspace.ownerId,
      active: false,
      status: 'candidate',
      origin,
      dimension: parsed.dimension,
      normalizedKey: key,
      polarity: parsed.polarity,
      value: null,
      scope,
      confidence: derivedConfidence(independent.length, resources.size, strong),
      occurrenceCount: independent.length,
      evidenceCount: independent.length,
      evidenceEventIds: evidence.map((e) => e._id),
      evidenceSummary: patternSummary(independent, resources.size, subject.label, parsed.polarity),
      confirmedByUser: false,
      lastObservedAt: new Date(),
    });
    memoryRuntime().logger.info('creative_memory_candidate_created', {
      workspaceId: workspace._id.toString(),
      normalizedKey: key,
      signals: independent.length,
      resources: resources.size,
    });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
  }
}

const RESOURCE_WORDS: Record<string, [string, string]> = {
  content_plan_item: ['plan', 'planes'],
  campaign_deliverable: ['campaña', 'campañas'],
  guardian_report: ['revisión', 'revisiones'],
  pixel_command: ['propuesta', 'propuestas'],
  content_item: ['pieza', 'piezas'],
};

/** "En 3 decisiones sobre 2 planes quitaste o cambiaste Stories." (sin ids). */
export function patternSummary(
  events: CreativeDecisionEventDocument[],
  resources: number,
  label: string,
  polarity: string,
): string {
  const types = new Set(events.map((e) => e.resourceType ?? 'other'));
  const [one, many] =
    types.size === 1
      ? (RESOURCE_WORDS[[...types][0]!] ?? ['recurso', 'recursos'])
      : ['recurso', 'recursos'];
  const verb = polarity === 'avoid' ? `quitaste o cambiaste ${label}` : `elegiste ${label}`;
  return `En ${events.length} decisiones sobre ${resources} ${resources === 1 ? one : many} diferentes ${verb}.`;
}
