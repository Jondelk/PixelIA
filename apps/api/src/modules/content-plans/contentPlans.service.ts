import {
  CONTENT_PLAN_ITEM_STATUS_LABELS,
  type AcceptContentPlanItemResponse,
  type ContentPlanItemCounts,
  type ContentPlanListResponse,
  type ContentPlanResponse,
  type ContentPlanStatus,
  type CreateContentPlanData,
  type GenerateContentPlanData,
  type UpdateContentPlanInput,
  type UpdateContentPlanItemInput,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/errors.js';
import { PERSONAL_CONTEXT_NOT_CONFIGURED } from '../conversations/context/personalContext.builder.js';
import { createContentItem } from '../operations/content.service.js';
import { ContentItemModel, toContentItemDTO } from '../operations/contentItem.model.js';
import { resourceId } from '../operations/operations.scope.js';
import { ProjectModel, toProjectDTO } from '../operations/project.model.js';
import { loadPersonalDna } from '../personal/personal.service.js';
import { personalDnaContentOf } from '../personal/personalDna.model.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import {
  ContentPlanModel,
  EMPTY_ITEM_COUNTS,
  toContentPlanDTO,
  type ContentPlanDocument,
} from './contentPlan.model.js';
import {
  ContentPlanItemModel,
  toContentPlanItemDTO,
  type ContentPlanItemDocument,
} from './contentPlanItem.model.js';
import {
  ContentPlanningError,
  PLANNING_CONTEXT_LIMITS,
  type ContentPlanningEngine,
} from './contentPlanning.engine.js';

/*
 * Content Planner de un Workspace. Todas las funciones reciben el workspace ya autorizado
 * (requireWorkspaceAccess) y toda consulta filtra por su workspaceId; las propuestas, además, por
 * su contentPlanId. Nunca se lee un workspaceId del cuerpo.
 *
 * - Generar con Pixel: solo en un workspace personal (Enterprise → 400 feature_not_available).
 * - Regenerar crea un plan NUEVO; el anterior se conserva intacto (historial).
 * - DELETE de un plan lo archiva: sus propuestas (también las rechazadas) se conservan.
 * - Aceptar una propuesta = convertirla en un ContentItem (source pixel, status idea). Idempotente.
 * - El planner solo LEE proyectos: no cambia fechas ni estados ni crea tareas.
 */

export const CONTENT_PLAN_NOT_FOUND = 'Plan de contenido no encontrado';
export const CONTENT_PLAN_ITEM_NOT_FOUND = 'Propuesta no encontrada';

export interface ContentPlanDeps {
  planningEngine: ContentPlanningEngine;
}

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "Octubre · Semana 2" (hasta 7 días) o "Octubre · 12–25" (más largo; con meses si cruza). */
export function defaultPlanName(startDate: string, endDate: string): string {
  const [, startMonth, startDay] = startDate.split('-').map(Number) as [number, number, number];
  const [, endMonth, endDay] = endDate.split('-').map(Number) as [number, number, number];
  const month = MONTHS[startMonth - 1]!;
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
  if (days <= 7 && startMonth === endMonth) return `${month} · Semana ${Math.ceil(startDay / 7)}`;
  if (startMonth === endMonth) return `${month} · ${startDay}–${endDay}`;
  return `${startDay} ${month.toLowerCase().slice(0, 3)} – ${endDay} ${MONTHS[endMonth - 1]!.toLowerCase().slice(0, 3)}`;
}

/* ---------- Lectura ---------- */

async function itemCountsFor(
  workspace: WorkspaceDocument,
  planIds: Types.ObjectId[],
): Promise<Map<string, ContentPlanItemCounts>> {
  const counts = new Map<string, ContentPlanItemCounts>();
  if (planIds.length === 0) return counts;
  const groups = await ContentPlanItemModel.aggregate<{
    _id: { plan: Types.ObjectId; status: keyof ContentPlanItemCounts };
    count: number;
  }>([
    { $match: { workspaceId: workspace._id, contentPlanId: { $in: planIds } } },
    { $group: { _id: { plan: '$contentPlanId', status: '$status' }, count: { $sum: 1 } } },
  ]);
  for (const group of groups) {
    const key = group._id.plan.toString();
    const current = counts.get(key) ?? { ...EMPTY_ITEM_COUNTS };
    current[group._id.status] = group.count;
    counts.set(key, current);
  }
  return counts;
}

async function findPlan(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<ContentPlanDocument> {
  const plan = await ContentPlanModel.findOne({
    _id: resourceId(rawId, CONTENT_PLAN_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!plan) throw notFound(CONTENT_PLAN_NOT_FOUND);
  return plan;
}

async function findItem(
  workspace: WorkspaceDocument,
  plan: ContentPlanDocument,
  rawId: unknown,
): Promise<ContentPlanItemDocument> {
  const item = await ContentPlanItemModel.findOne({
    _id: resourceId(rawId, CONTENT_PLAN_ITEM_NOT_FOUND),
    workspaceId: workspace._id,
    contentPlanId: plan._id,
  });
  if (!item) throw notFound(CONTENT_PLAN_ITEM_NOT_FOUND);
  return item;
}

async function planResponse(
  workspace: WorkspaceDocument,
  plan: ContentPlanDocument,
): Promise<ContentPlanResponse> {
  const items = await ContentPlanItemModel.find({
    workspaceId: workspace._id,
    contentPlanId: plan._id,
  }).sort({ position: 1, _id: 1 });
  const counts = (await itemCountsFor(workspace, [plan._id])).get(plan._id.toString());
  return { plan: toContentPlanDTO(plan, counts), items: items.map(toContentPlanItemDTO) };
}

export async function listContentPlans(
  workspace: WorkspaceDocument,
  query: { status?: ContentPlanStatus[]; limit: number; offset: number },
): Promise<ContentPlanListResponse> {
  const filter = {
    workspaceId: workspace._id,
    status: query.status ? { $in: query.status } : { $ne: 'archived' as const },
  };
  const [docs, total] = await Promise.all([
    ContentPlanModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(query.offset)
      .limit(query.limit),
    ContentPlanModel.countDocuments(filter),
  ]);
  const counts = await itemCountsFor(
    workspace,
    docs.map((doc) => doc._id),
  );
  return { plans: docs.map((doc) => toContentPlanDTO(doc, counts.get(doc._id.toString()))), total };
}

export async function getContentPlan(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<ContentPlanResponse> {
  return planResponse(workspace, await findPlan(workspace, rawId));
}

/* ---------- Generación con Pixel ---------- */

function planningErrorToHttp(err: ContentPlanningError): AppError {
  switch (err.kind) {
    case 'platforms_missing':
      return new AppError(400, 'BAD_REQUEST', err.message, { reason: 'content_platforms_missing' });
    case 'unavailable':
      return new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'La generación de planes no está disponible ahora mismo',
        {
          reason: 'content_plan_generation_unavailable',
        },
      );
    case 'failed':
      return new AppError(
        502,
        'INTERNAL_ERROR',
        'Pixel no pudo construir un plan fundamentado. Inténtalo de nuevo',
        {
          reason: 'content_plan_generation_failed',
        },
      );
  }
}

export async function generateContentPlan(
  workspace: WorkspaceDocument,
  input: GenerateContentPlanData,
  deps: ContentPlanDeps,
): Promise<ContentPlanResponse> {
  assertWorkspaceFeature(
    workspace,
    'contentPlanner',
    'El plan de contenido con Pixel está disponible solo en un Pixel Personal',
  );
  const { profile, personalDna } = await loadPersonalDna(workspace);
  if (!profile || !personalDna) {
    throw new AppError(409, 'CONFLICT', PERSONAL_CONTEXT_NOT_CONFIGURED, {
      reason: 'personal_context_not_configured',
    });
  }
  const previousPlan = input.regenerateFrom
    ? await findPlan(workspace, input.regenerateFrom)
    : null;

  // Contexto limitado: proyectos vivos, contenido reciente y propuestas recientes (para no repetir).
  const [projects, recentContent, regeneratedItems, recentProposals] = await Promise.all([
    ProjectModel.find({ workspaceId: workspace._id, status: { $in: ['active', 'planned'] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(PLANNING_CONTEXT_LIMITS.activeProjects),
    ContentItemModel.find({ workspaceId: workspace._id })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(PLANNING_CONTEXT_LIMITS.recentContent),
    previousPlan
      ? ContentPlanItemModel.find({ workspaceId: workspace._id, contentPlanId: previousPlan._id })
      : Promise.resolve([]),
    ContentPlanItemModel.find({ workspaceId: workspace._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(PLANNING_CONTEXT_LIMITS.previousProposals),
  ]);
  const seenProposals = new Set<string>();
  const previousProposals = [...regeneratedItems, ...recentProposals]
    .filter((item) => !seenProposals.has(item.id) && Boolean(seenProposals.add(item.id)))
    .map((item) => ({ title: item.title, status: item.status }));

  let proposal;
  try {
    proposal = await deps.planningEngine.plan({
      workspaceId: workspace._id.toString(),
      personalDna: personalDnaContentOf(personalDna),
      activeProjects: projects.map((project) => toProjectDTO(project)),
      recentContent: recentContent.map(toContentItemDTO),
      previousProposals,
      requestedPeriod: { startDate: input.startDate, endDate: input.endDate },
      desiredFrequency: input.frequency,
      requestedPlatforms: input.platforms,
      requestedGoal: input.goal,
      tzOffset: input.tzOffset,
    });
  } catch (err) {
    if (err instanceof ContentPlanningError) throw planningErrorToHttp(err);
    throw err;
  }

  const plan = await ContentPlanModel.create({
    workspaceId: workspace._id,
    name: input.name ?? defaultPlanName(input.startDate, input.endDate),
    objective: input.goal?.trim() || null,
    period: { startDate: input.startDate, endDate: input.endDate },
    strategySummary: proposal.strategySummary,
    pillars: proposal.pillars,
    targetAudience: proposal.targetAudience,
    platforms: proposal.platforms,
    status: 'draft',
    generatedBy: 'pixel',
    personalDnaVersion: personalDna.version,
    generation: {
      ...proposal.meta,
      discardedItems: proposal.discardedItems,
      frequencyPerWeek: proposal.frequencyPerWeek,
      frequencySource: proposal.frequencySource,
      requestedGoal: input.goal?.trim() || null,
      regeneratedFromPlanId: previousPlan?._id ?? null,
    },
  });
  try {
    await ContentPlanItemModel.insertMany(
      proposal.items.map((item, position) => ({
        ...item,
        projectId: item.projectId ? new Types.ObjectId(item.projectId) : null,
        workspaceId: workspace._id,
        contentPlanId: plan._id,
        status: 'proposed',
        position,
      })),
    );
  } catch (err) {
    // Sin propuestas el plan no sirve: no se deja a medias.
    await ContentPlanModel.deleteOne({ _id: plan._id, workspaceId: workspace._id });
    throw err;
  }
  return planResponse(workspace, plan);
}

/* ---------- Plan manual y edición ---------- */

export async function createContentPlan(
  workspace: WorkspaceDocument,
  input: CreateContentPlanData,
): Promise<ContentPlanResponse> {
  const plan = await ContentPlanModel.create({
    workspaceId: workspace._id,
    name: input.name,
    objective: input.objective,
    period: { startDate: input.startDate, endDate: input.endDate },
    platforms: input.platforms,
    status: 'draft',
    generatedBy: 'manual',
  });
  return planResponse(workspace, plan);
}

export async function updateContentPlan(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: UpdateContentPlanInput,
): Promise<ContentPlanResponse> {
  const plan = await findPlan(workspace, rawId);
  plan.set(input);
  await plan.save();
  return planResponse(workspace, plan);
}

/** DELETE = archivar (conserva propuestas, también las rechazadas). Idempotente. */
export async function archiveContentPlan(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<ContentPlanResponse> {
  const plan = await findPlan(workspace, rawId);
  if (plan.status !== 'archived') {
    plan.status = 'archived';
    await plan.save();
  }
  return planResponse(workspace, plan);
}

/* ---------- Propuestas ---------- */

function assertNotConverted(item: ContentPlanItemDocument): void {
  if (item.status === 'converted') {
    throw new AppError(
      409,
      'CONFLICT',
      `Esta propuesta ya está en Contenido (${CONTENT_PLAN_ITEM_STATUS_LABELS.converted.toLowerCase()}): edítala allí`,
      { reason: 'content_plan_item_converted' },
    );
  }
}

export async function updateContentPlanItem(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
  input: UpdateContentPlanItemInput,
) {
  const plan = await findPlan(workspace, planId);
  const item = await findItem(workspace, plan, itemId);
  assertNotConverted(item);
  const { scheduledFor, status, ...rest } = input;
  item.set(rest);
  if (scheduledFor !== undefined) item.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
  if (status === 'proposed') {
    item.status = 'proposed';
    item.rejectionReason = null;
  }
  await item.save();
  return { item: toContentPlanItemDTO(item) };
}

export async function rejectContentPlanItem(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
  reason: string | null | undefined,
) {
  const plan = await findPlan(workspace, planId);
  const item = await findItem(workspace, plan, itemId);
  assertNotConverted(item);
  item.status = 'rejected';
  item.rejectionReason = reason ?? null;
  await item.save();
  return { item: toContentPlanItemDTO(item) };
}

async function existingConversion(
  workspace: WorkspaceDocument,
  item: ContentPlanItemDocument,
): Promise<AcceptContentPlanItemResponse> {
  const contentItem = item.convertedContentItemId
    ? await ContentItemModel.findOne({
        _id: item.convertedContentItemId,
        workspaceId: workspace._id,
      })
    : null;
  return {
    item: toContentPlanItemDTO(item),
    contentItem: contentItem ? toContentItemDTO(contentItem) : null,
    created: false,
  };
}

/**
 * Propuesta → ContentItem (source pixel, status idea), explícito e idempotente:
 * 1. reserva atómica: `convertedContentItemId: null → nuevoId` (solo una llamada gana);
 * 2. crea el ContentItem con ese id, copiando proyecto, fecha, título, concepto, hook…;
 * 3. si la creación falla, se deshace la reserva. Una segunda llamada devuelve lo existente.
 */
export async function acceptContentPlanItem(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
): Promise<AcceptContentPlanItemResponse> {
  const plan = await findPlan(workspace, planId);
  const item = await findItem(workspace, plan, itemId);
  if (item.convertedContentItemId) return existingConversion(workspace, item);

  const contentItemId = new Types.ObjectId();
  const previousStatus = item.status;
  const claimed = await ContentPlanItemModel.findOneAndUpdate(
    {
      _id: item._id,
      workspaceId: workspace._id,
      contentPlanId: plan._id,
      convertedContentItemId: null,
    },
    { $set: { convertedContentItemId: contentItemId, status: 'converted', rejectionReason: null } },
    { returnDocument: 'after' },
  );
  if (!claimed) return existingConversion(workspace, await findItem(workspace, plan, itemId));

  try {
    const contentItem = await createContentItem(
      workspace,
      {
        title: claimed.title,
        concept: claimed.concept,
        objective: claimed.objective?.slice(0, 500) ?? null,
        platform: claimed.platform,
        format: claimed.format,
        status: 'idea',
        hook: claimed.hook,
        caption: null,
        script: null,
        notes: [
          `Propuesta del plan «${plan.name}».`,
          claimed.rationale ? `Por qué: ${claimed.rationale}` : null,
          claimed.suggestedAngle ? `Ángulo: ${claimed.suggestedAngle}` : null,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 5000),
        projectId: claimed.projectId?.toString() ?? null,
        scheduledFor: claimed.scheduledFor?.toISOString() ?? null,
        publishedAt: null,
        tags: claimed.pillar ? [claimed.pillar.slice(0, 40)] : [],
      },
      { source: 'pixel', id: contentItemId },
    );
    return { item: toContentPlanItemDTO(claimed), contentItem, created: true };
  } catch (err) {
    await ContentPlanItemModel.updateOne(
      { _id: item._id, workspaceId: workspace._id, convertedContentItemId: contentItemId },
      { $set: { convertedContentItemId: null, status: previousStatus } },
    );
    throw err;
  }
}
