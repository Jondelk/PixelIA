import {
  CREATIVE_MEMORY_MAX_EVIDENCE,
  type CreativeMemory,
  type CreativeMemoryListQuery,
  type CreativeMemoryOrigin,
  type CreativeMemoryResponse,
  type CreativeMemoryScopeType,
  type CreativeMemoryStatus,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { fold } from '../../ai/index.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { CampaignModel } from '../campaigns/campaign.model.js';
import { ContentPlanModel } from '../content-plans/contentPlan.model.js';
import { ProjectModel } from '../operations/project.model.js';
import { fieldError, resourceId } from '../operations/operations.scope.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { CreativeDecisionEventModel } from './creativeDecisionEvent.model.js';
import {
  CreativeMemoryModel,
  toCreativeMemoryDTO,
  type CreativeMemoryDocument,
} from './creativeMemory.model.js';
import { memoryRuntime } from './creativeMemory.runtime.js';
import { recordCreativeDecision } from './memory.detector.js';
import {
  kindFor,
  MEMORY_REJECTION_MESSAGES,
  memoryRejection,
  parseMemoryKey,
  parseMemoryText,
  type MemoryRejection,
  type ParsedMemory,
} from './memory.lexicon.js';

/*
 * Creative Memory (docs/CREATIVE-MEMORY.md). Ciclo de vida:
 *   candidata → confirm → activa · candidata → dismiss → descartada
 *   activa → forget → olvidada · activa → replace → reemplazada (+ nueva activa)
 *   instrucción explícita → activa (la confirmación es la de PixelCommand o el clic en la página)
 * Nunca se edita en sitio ni se borra: cada cambio deja historial (supersedes / supersededBy).
 * Recurso ajeno, inexistente o malformado → 404.
 */

export const CREATIVE_MEMORY_NOT_FOUND = 'Memoria no encontrada';

/** Confianza interna: una instrucción explícita o una candidata confirmada valen casi certeza. */
export const CONFIDENCE = { explicit: 0.95, confirmedCandidate: 0.9 } as const;

const conflict = (message: string, reason: string) =>
  new AppError(409, 'CONFLICT', message, { reason });

export function assertCreativeMemory(workspace: WorkspaceDocument): void {
  assertWorkspaceFeature(
    workspace,
    'creativeMemory',
    'La memoria creativa no está disponible en este tipo de Pixel',
  );
}

async function findMemory(workspace: WorkspaceDocument, rawId: unknown) {
  const memory = await CreativeMemoryModel.findOne({
    _id: resourceId(rawId, CREATIVE_MEMORY_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!memory) throw notFound(CREATIVE_MEMORY_NOT_FOUND);
  return memory;
}

/* ---------- Lectura ---------- */

const VIEW_STATUSES: Record<CreativeMemoryListQuery['view'], CreativeMemoryStatus[]> = {
  active: ['active'],
  candidate: ['candidate'],
  history: ['superseded', 'dismissed', 'forgotten'],
  all: ['active', 'candidate', 'superseded', 'dismissed', 'forgotten'],
};

export async function listCreativeMemories(
  workspace: WorkspaceDocument,
  query: CreativeMemoryListQuery,
): Promise<CreativeMemory[]> {
  assertCreativeMemory(workspace);
  const docs = await CreativeMemoryModel.find({
    workspaceId: workspace._id,
    status: { $in: VIEW_STATUSES[query.view] },
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(100);
  return docs.map(toCreativeMemoryDTO);
}

export async function getCreativeMemory(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CreativeMemoryResponse> {
  assertCreativeMemory(workspace);
  const memory = await findMemory(workspace, rawId);
  const ids = (memory.evidenceEventIds ?? []).slice(-CREATIVE_MEMORY_MAX_EVIDENCE);
  const relatedIds = [memory.supersedesMemoryId, memory.supersededByMemoryId].filter(
    (id): id is Types.ObjectId => Boolean(id),
  );
  const [events, related] = await Promise.all([
    ids.length
      ? CreativeDecisionEventModel.find({ workspaceId: workspace._id, _id: { $in: ids } })
          .sort({ occurredAt: -1 })
          .select({ description: 1, occurredAt: 1 })
      : [],
    relatedIds.length
      ? CreativeMemoryModel.find({ workspaceId: workspace._id, _id: { $in: relatedIds } })
      : [],
  ]);
  return {
    memory: toCreativeMemoryDTO(memory),
    // Evidencia humana, sin ids: "Quitaste Stories en «Plan de junio»".
    evidence: events.map((event) => ({
      description: event.description,
      occurredAt: event.occurredAt.toISOString(),
    })),
    related: related.map(toCreativeMemoryDTO),
  };
}

/* ---------- Alcance ---------- */

export interface ResolvedScope {
  type: CreativeMemoryScopeType;
  id: Types.ObjectId | null;
  label: string | null;
}

export const WORKSPACE_SCOPE: ResolvedScope = { type: 'workspace', id: null, label: null };

/** Un alcance siempre apunta a un recurso de ESTE workspace (si no, 400 en el campo). */
export async function resolveMemoryScope(
  workspace: WorkspaceDocument,
  scope: { type: CreativeMemoryScopeType; id?: string } | undefined,
): Promise<ResolvedScope> {
  if (!scope || scope.type === 'workspace') return WORKSPACE_SCOPE;
  const id = new Types.ObjectId(scope.id!);
  const filter = { _id: id, workspaceId: workspace._id };
  const doc =
    scope.type === 'campaign'
      ? await CampaignModel.findOne(filter).select({ name: 1 })
      : scope.type === 'project'
        ? await ProjectModel.findOne(filter).select({ name: 1 })
        : await ContentPlanModel.findOne(filter).select({ name: 1 });
  if (!doc) throw fieldError('scope.id', 'Ese recurso no existe en este Pixel');
  return { type: scope.type, id, label: (doc as { name?: string }).name ?? null };
}

const sameScope = (memory: CreativeMemoryDocument, scope: ResolvedScope) =>
  (memory.scope?.type ?? 'workspace') === scope.type &&
  (memory.scope?.id?.toString() ?? null) === (scope.id?.toString() ?? null);

const topicOf = (key: string | undefined) => {
  const parsed = key ? parseMemoryKey(key) : null;
  return parsed ? `${parsed.dimension}:${parsed.subject}` : null;
};

/* ---------- Instrucción explícita ---------- */

export type MemoryPreview =
  | { kind: 'rejected'; rejection: MemoryRejection; message: string }
  | { kind: 'unclear' }
  | {
      kind: 'ok';
      parsed: ParsedMemory;
      scope: ResolvedScope;
      /** Ya existe activa con la misma clave y alcance: no se duplica. */
      duplicate: CreativeMemoryDocument | null;
      /** Activas del mismo tema y alcance que quedarán reemplazadas. */
      replaces: CreativeMemoryDocument[];
    };

/** Lo que pasaría al recordar `text` (sin escribir nada): lo usa la propuesta de PixelCommand. */
export async function previewMemory(
  workspace: WorkspaceDocument,
  text: string,
  scope: ResolvedScope,
): Promise<MemoryPreview> {
  const rejection = memoryRejection(text, workspace.type);
  if (rejection)
    return { kind: 'rejected', rejection, message: MEMORY_REJECTION_MESSAGES[rejection] };
  const parsed = parseMemoryText(text);
  if (!parsed) return { kind: 'unclear' };
  const topic = `${parsed.dimension}:${parsed.subjectKey}`;
  const active = await CreativeMemoryModel.find({
    workspaceId: workspace._id,
    status: 'active',
    normalizedKey: { $regex: `^${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` },
  });
  const inScope = active.filter((memory) => sameScope(memory, scope));
  const duplicate =
    inScope.find(
      (memory) =>
        memory.normalizedKey === parsed.normalizedKey &&
        (parsed.dimension !== 'workflow' || memory.value === parsed.value),
    ) ?? null;
  const replaces = duplicate
    ? []
    : inScope.filter((memory) => topicOf(memory.normalizedKey) === topic);
  return { kind: 'ok', parsed, scope, duplicate, replaces };
}

export interface RememberOptions {
  sourceEventKey: string;
  origin?: CreativeMemoryOrigin;
  source?: string;
}

/**
 * Crea (o refuerza) una memoria ACTIVA explícita. Contradicción en el mismo alcance → la anterior
 * queda `superseded` y la nueva apunta a ella (nunca se edita en silencio). Lo factual, sensible o
 * con credenciales nunca se guarda (400 `creative_memory_not_allowed`).
 */
export async function rememberCreativeMemory(
  workspace: WorkspaceDocument,
  text: string,
  scope: ResolvedScope,
  options: RememberOptions,
): Promise<{ memory: CreativeMemory; created: boolean }> {
  assertCreativeMemory(workspace);
  const preview = await previewMemory(workspace, text, scope);
  if (preview.kind === 'rejected') {
    throw badRequest(preview.message, {
      reason: 'creative_memory_not_allowed',
      rejection: preview.rejection,
    });
  }
  if (preview.kind === 'unclear') {
    throw badRequest('No entendí qué debo recordar: dímelo con un poco más de detalle', {
      reason: 'creative_memory_unclear',
    });
  }
  const { parsed } = preview;
  const now = new Date();
  if (preview.duplicate) {
    const updated = await CreativeMemoryModel.findOneAndUpdate(
      { _id: preview.duplicate._id, workspaceId: workspace._id, status: 'active' },
      {
        $set: { confirmedByUser: true, lastObservedAt: now, confidence: CONFIDENCE.explicit },
        $inc: { occurrenceCount: 1 },
      },
      { new: true },
    );
    return { memory: toCreativeMemoryDTO(updated ?? preview.duplicate), created: false };
  }

  // Una candidata con la misma clave y alcance se confirma (no se duplica).
  const candidate = await CreativeMemoryModel.findOne({
    workspaceId: workspace._id,
    status: 'candidate',
    normalizedKey: parsed.normalizedKey,
    'scope.type': scope.type,
    'scope.id': scope.id,
  });
  if (candidate) {
    return { memory: await activateCandidate(workspace, candidate), created: false };
  }

  const memory = await createActive(workspace, {
    parsed,
    scope,
    statement: parsed.statement,
    origin: options.origin ?? 'explicit',
    replaces: preview.replaces,
  });
  await recordCreativeDecision(workspace, {
    eventType: 'explicit_memory_instruction',
    resourceType: 'creative_memory',
    resourceId: memory.id,
    campaignId: scope.type === 'campaign' ? scope.id : null,
    sourceEventKey: options.sourceEventKey,
    description: `Pediste recordar: «${parsed.statement}»`,
    metadata: { source: options.source ?? 'explicit', dimension: parsed.dimension },
  });
  memoryRuntime().logger.info('creative_memory_remembered', {
    workspaceId: workspace._id.toString(),
    normalizedKey: parsed.normalizedKey,
    scope: scope.type,
    replaced: preview.replaces.length,
  });
  return { memory, created: true };
}

/** Marca las anteriores como reemplazadas y crea la nueva; si la creación falla, las restaura. */
async function createActive(
  workspace: WorkspaceDocument,
  input: {
    parsed: ParsedMemory;
    scope: ResolvedScope;
    statement: string;
    origin: CreativeMemoryOrigin;
    replaces: CreativeMemoryDocument[];
  },
): Promise<CreativeMemory> {
  const id = new Types.ObjectId();
  const replacedIds = input.replaces.map((memory) => memory._id);
  if (replacedIds.length) {
    await CreativeMemoryModel.updateMany(
      { workspaceId: workspace._id, _id: { $in: replacedIds }, status: 'active' },
      { $set: { status: 'superseded', active: false, supersededByMemoryId: id } },
    );
  }
  try {
    const doc = await CreativeMemoryModel.create({
      _id: id,
      workspaceId: workspace._id,
      memoryScope: workspace.type,
      kind: kindFor(input.parsed.dimension, input.parsed.polarity),
      content: input.statement,
      createdByUserId: workspace.ownerId,
      active: true,
      status: 'active',
      origin: input.origin,
      dimension: input.parsed.dimension,
      normalizedKey: input.parsed.normalizedKey,
      polarity: input.parsed.polarity,
      value: input.parsed.value,
      scope: input.scope,
      confidence: CONFIDENCE.explicit,
      occurrenceCount: 1,
      evidenceCount: 0,
      evidenceEventIds: [],
      confirmedByUser: true,
      confirmedAt: new Date(),
      supersedesMemoryId: replacedIds[0] ?? null,
      lastObservedAt: new Date(),
    });
    return toCreativeMemoryDTO(doc);
  } catch (err) {
    if (replacedIds.length) {
      await CreativeMemoryModel.updateMany(
        { workspaceId: workspace._id, _id: { $in: replacedIds }, supersededByMemoryId: id },
        { $set: { status: 'active', active: true, supersededByMemoryId: null } },
      );
    }
    if ((err as { code?: unknown }).code === 11000) {
      throw conflict('Pixel ya recuerda eso', 'creative_memory_duplicate');
    }
    throw err;
  }
}

/* ---------- Candidatas ---------- */

async function activateCandidate(
  workspace: WorkspaceDocument,
  candidate: CreativeMemoryDocument,
): Promise<CreativeMemory> {
  const scope: ResolvedScope = {
    type: candidate.scope?.type ?? 'workspace',
    id: candidate.scope?.id ?? null,
    label: candidate.scope?.label ?? null,
  };
  const topic = topicOf(candidate.normalizedKey);
  // Lo que contradice en el mismo alcance queda reemplazado.
  const contradicting = (
    await CreativeMemoryModel.find({ workspaceId: workspace._id, status: 'active' })
  ).filter(
    (memory) =>
      sameScope(memory, scope) &&
      topicOf(memory.normalizedKey) === topic &&
      memory.normalizedKey !== candidate.normalizedKey,
  );
  if (contradicting.length) {
    await CreativeMemoryModel.updateMany(
      {
        workspaceId: workspace._id,
        _id: { $in: contradicting.map((m) => m._id) },
        status: 'active',
      },
      { $set: { status: 'superseded', active: false, supersededByMemoryId: candidate._id } },
    );
  }
  const now = new Date();
  const updated = await CreativeMemoryModel.findOneAndUpdate(
    { _id: candidate._id, workspaceId: workspace._id, status: 'candidate' },
    {
      $set: {
        status: 'active',
        active: true,
        confirmedByUser: true,
        confirmedAt: now,
        confidence: CONFIDENCE.confirmedCandidate,
        lastObservedAt: now,
        supersedesMemoryId: contradicting[0]?._id ?? null,
      },
    },
    { new: true },
  );
  if (!updated)
    throw conflict('Esta memoria ya no es una candidata', 'creative_memory_not_candidate');
  await recordCreativeDecision(workspace, {
    eventType: 'memory_candidate_confirmed',
    resourceType: 'creative_memory',
    resourceId: candidate._id,
    sourceEventKey: `creative-memory:${candidate._id.toString()}:confirm`,
    description: `Confirmaste: «${candidate.content}»`,
    metadata: { source: 'memory_page', dimension: candidate.dimension ?? null },
  });
  return toCreativeMemoryDTO(updated);
}

export async function confirmCreativeMemory(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CreativeMemory> {
  assertCreativeMemory(workspace);
  const memory = await findMemory(workspace, rawId);
  if (memory.status === 'active') return toCreativeMemoryDTO(memory);
  if (memory.status !== 'candidate') {
    throw conflict('Esta memoria ya no es una candidata', 'creative_memory_not_candidate');
  }
  return activateCandidate(workspace, memory);
}

export async function dismissCreativeMemory(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CreativeMemory> {
  assertCreativeMemory(workspace);
  const memory = await findMemory(workspace, rawId);
  if (memory.status === 'dismissed') return toCreativeMemoryDTO(memory);
  const updated = await CreativeMemoryModel.findOneAndUpdate(
    { _id: memory._id, workspaceId: workspace._id, status: 'candidate' },
    { $set: { status: 'dismissed', active: false, dismissedAt: new Date() } },
    { new: true },
  );
  if (!updated)
    throw conflict('Esta memoria ya no es una candidata', 'creative_memory_not_candidate');
  await recordCreativeDecision(workspace, {
    eventType: 'memory_candidate_dismissed',
    resourceType: 'creative_memory',
    resourceId: memory._id,
    sourceEventKey: `creative-memory:${memory._id.toString()}:dismiss`,
    description: `Indicaste que no fue intencional: «${memory.content}»`,
    metadata: { source: 'memory_page', dimension: memory.dimension ?? null },
  });
  return toCreativeMemoryDTO(updated);
}

/* ---------- Activas ---------- */

export async function forgetCreativeMemory(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CreativeMemory> {
  assertCreativeMemory(workspace);
  const memory = await findMemory(workspace, rawId);
  if (memory.status === 'forgotten') return toCreativeMemoryDTO(memory);
  const updated = await CreativeMemoryModel.findOneAndUpdate(
    { _id: memory._id, workspaceId: workspace._id, status: 'active' },
    { $set: { status: 'forgotten', active: false, forgottenAt: new Date() } },
    { new: true },
  );
  if (!updated)
    throw conflict('Solo se puede olvidar una memoria activa', 'creative_memory_not_active');
  memoryRuntime().logger.info('creative_memory_forgotten', {
    workspaceId: workspace._id.toString(),
    normalizedKey: memory.normalizedKey,
  });
  return toCreativeMemoryDTO(updated);
}

/** Editar = nueva memoria activa; la anterior queda reemplazada (historial auditable). */
export async function replaceCreativeMemory(
  workspace: WorkspaceDocument,
  rawId: unknown,
  text: string,
): Promise<CreativeMemory> {
  assertCreativeMemory(workspace);
  const memory = await findMemory(workspace, rawId);
  if (memory.status !== 'active') {
    throw conflict('Solo se puede editar una memoria activa', 'creative_memory_not_active');
  }
  const rejection = memoryRejection(text, workspace.type);
  if (rejection) {
    throw badRequest(MEMORY_REJECTION_MESSAGES[rejection], {
      reason: 'creative_memory_not_allowed',
      rejection,
    });
  }
  const parsed = parseMemoryText(text);
  if (!parsed) {
    throw badRequest('No entendí qué debo recordar: dímelo con un poco más de detalle', {
      reason: 'creative_memory_unclear',
    });
  }
  const scope: ResolvedScope = {
    type: memory.scope?.type ?? 'workspace',
    id: memory.scope?.id ?? null,
    label: memory.scope?.label ?? null,
  };
  // Si el texto nuevo no es del léxico, conserva la clave anterior y cambia solo el enunciado.
  const effective: ParsedMemory =
    parsed.dimension === 'other' && memory.normalizedKey
      ? {
          ...parsed,
          dimension: memory.dimension ?? 'other',
          normalizedKey: memory.normalizedKey,
          polarity: memory.polarity ?? parsed.polarity,
        }
      : parsed;
  const others = (
    await CreativeMemoryModel.find({ workspaceId: workspace._id, status: 'active' })
  ).filter(
    (m) =>
      !m._id.equals(memory._id) &&
      sameScope(m, scope) &&
      topicOf(m.normalizedKey) === topicOf(effective.normalizedKey),
  );
  return createActive(workspace, {
    parsed: effective,
    scope,
    statement: effective.dimension === 'other' ? parsed.statement : effective.statement,
    origin: 'explicit',
    replaces: [memory, ...others],
  });
}

/* ---------- Para PixelCommand ---------- */

const MEMORY_FORGET_SCAN = 50;

/** Activas que una frase como "olvida lo de evitar Stories" señala (por tema o por palabras). */
export async function findMemoriesToForget(
  workspace: WorkspaceDocument,
  text: string,
): Promise<CreativeMemoryDocument[]> {
  const active = await CreativeMemoryModel.find({ workspaceId: workspace._id, status: 'active' })
    .sort({ updatedAt: -1 })
    .limit(MEMORY_FORGET_SCAN);
  const parsed = parseMemoryText(text);
  if (parsed && parsed.dimension !== 'other') {
    const topic = `${parsed.dimension}:${parsed.subjectKey}`;
    const byTopic = active.filter((memory) => topicOf(memory.normalizedKey) === topic);
    if (byTopic.length) return byTopic;
  }
  const words = new Set((fold(text).match(/[a-z0-9ñ]+/g) ?? []).filter((word) => word.length >= 5));
  return active.filter((memory) => {
    const own = (fold(memory.content).match(/[a-z0-9ñ]+/g) ?? []).filter((w) => w.length >= 5);
    return own.filter((word) => words.has(word)).length >= 2;
  });
}
