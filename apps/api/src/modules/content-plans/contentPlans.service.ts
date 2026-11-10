import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLAN_ITEM_STATUS_LABELS,
  type AcceptContentPlanItemResponse,
  type ContentPlanItemCounts,
  type ContentPlanListResponse,
  type ContentPlanResponse,
  type ContentPlanStatus,
  type ContentPlatform,
  type CreateContentPlanData,
  type GenerateContentPlanData,
  type UpdateContentPlanInput,
  type UpdateContentPlanItemInput,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { AppError, notFound } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { loadBrandContext, loadCampaignForPlanning } from '../campaigns/campaigns.service.js';
import { PERSONAL_CONTEXT_NOT_CONFIGURED } from '../conversations/context/personalContext.builder.js';
import { createContentItem } from '../operations/content.service.js';
import { ContentItemModel, toContentItemDTO } from '../operations/contentItem.model.js';
import { fieldError, resourceId } from '../operations/operations.scope.js';
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
import {
  ENTERPRISE_PLANNING_LIMITS,
  type EnterprisePlanningStrategy,
} from './enterprisePlanning.strategy.js';
import { planningMemoryFor } from './planningMemory.js';
import { recordCreativeDecision } from '../creative-memory/memory.detector.js';
import {
  compact,
  dedupe,
  formatSignal,
  placementChangeSignals,
  textEditSignals,
} from '../creative-memory/memory.signals.js';

/*
 * Content Planner de un Workspace. Todas las funciones reciben el workspace ya autorizado
 * (requireWorkspaceAccess) y toda consulta filtra por su workspaceId; las propuestas, además, por
 * su contentPlanId. Nunca se lee un workspaceId del cuerpo.
 *
 * - Generar con Pixel: el MISMO endpoint para ambos tipos. La estrategia se elige por
 *   `workspace.type`: Personal → ContentPlanningEngine (PersonalDNA); Enterprise →
 *   EnterprisePlanningStrategy (BrandDNA + campaña opcional). La persistencia es compartida.
 * - Regenerar crea un plan NUEVO; el anterior se conserva intacto (historial).
 * - DELETE de un plan lo archiva: sus propuestas (también las rechazadas) se conservan.
 * - Aceptar una propuesta = convertirla en un ContentItem (source pixel, status idea). Idempotente.
 * - El planner solo LEE proyectos: no cambia fechas ni estados ni crea tareas.
 */

export const CONTENT_PLAN_NOT_FOUND = 'Plan de contenido no encontrado';
export const CONTENT_PLAN_ITEM_NOT_FOUND = 'Propuesta no encontrada';

export interface ContentPlanDeps {
  planningEngine: ContentPlanningEngine;
  enterprisePlanning: EnterprisePlanningStrategy;
  logger?: Logger;
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
  return {
    plan: toContentPlanDTO(plan, counts, workspace.type),
    items: items.map(toContentPlanItemDTO),
  };
}

export async function listContentPlans(
  workspace: WorkspaceDocument,
  query: { status?: ContentPlanStatus[]; campaignId?: string; limit: number; offset: number },
): Promise<ContentPlanListResponse> {
  const filter = {
    workspaceId: workspace._id,
    status: query.status ? { $in: query.status } : { $ne: 'archived' as const },
    ...(query.campaignId ? { campaignId: new Types.ObjectId(query.campaignId) } : {}),
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
  return {
    plans: docs.map((doc) => toContentPlanDTO(doc, counts.get(doc._id.toString()), workspace.type)),
    total,
  };
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

/** Plan generado listo para guardar (lo que comparten ambas estrategias). */
interface GeneratedPlanRecord {
  plan: {
    contextType: 'personal' | 'enterprise';
    name: string;
    objective: string | null;
    strategySummary: string;
    pillars: { name: string; rationale: string }[];
    targetAudience: string[];
    platforms: ContentPlatform[];
    personalDnaVersion: number | null;
    brandDnaVersion: number | null;
    campaignId: Types.ObjectId | null;
    campaignStrategyVersion: number | null;
    editorialObjective: string | null;
    campaignAlignment: string | null;
    distributionRationale: string | null;
    generation: {
      provider: string;
      model: string;
      mode: 'ai' | 'demo';
      discardedItems: number;
      frequencyPerWeek: number;
      frequencySource: 'request' | 'personal_dna' | 'default';
      requestedGoal: string | null;
      regeneratedFromPlanId: Types.ObjectId | null;
      memoryKeys: string[];
    };
  };
  items: Record<string, unknown>[];
}

/** Guarda el plan y sus propuestas; si las propuestas fallan, no deja nada a medias. */
async function persistGeneratedPlan(
  workspace: WorkspaceDocument,
  input: GenerateContentPlanData,
  record: GeneratedPlanRecord,
): Promise<ContentPlanResponse> {
  const plan = await ContentPlanModel.create({
    workspaceId: workspace._id,
    period: { startDate: input.startDate, endDate: input.endDate },
    status: 'draft',
    generatedBy: 'pixel',
    ...record.plan,
  });
  try {
    await ContentPlanItemModel.insertMany(
      record.items.map((item, position) => ({
        ...item,
        workspaceId: workspace._id,
        contentPlanId: plan._id,
        status: 'proposed',
        position,
      })),
    );
  } catch (err) {
    // Sin propuestas el plan no sirve: se borran el plan y cualquier propuesta suelta (R11).
    await Promise.all([
      ContentPlanItemModel.deleteMany({ workspaceId: workspace._id, contentPlanId: plan._id }),
      ContentPlanModel.deleteOne({ _id: plan._id, workspaceId: workspace._id }),
    ]);
    throw err;
  }
  return planResponse(workspace, plan);
}

async function runPlanner<T>(deps: ContentPlanDeps, generate: () => Promise<T>): Promise<T> {
  try {
    return await generate();
  } catch (err) {
    if (err instanceof ContentPlanningError) {
      // El motivo interno (qué validación falló) queda en el log; al cliente, el error genérico.
      deps.logger?.warn('Content Planner: no se generó el plan', {
        kind: err.kind,
        reason: err.message,
      });
      throw planningErrorToHttp(err);
    }
    throw err;
  }
}

/** Propuestas recientes del workspace (y las del plan que se regenera) para no repetirlas. */
async function previousProposalsFor(
  workspace: WorkspaceDocument,
  previousPlan: ContentPlanDocument | null,
  limit: number,
) {
  const [regeneratedItems, recentProposals] = await Promise.all([
    previousPlan
      ? ContentPlanItemModel.find({ workspaceId: workspace._id, contentPlanId: previousPlan._id })
      : Promise.resolve([]),
    ContentPlanItemModel.find({ workspaceId: workspace._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit),
  ]);
  const seen = new Set<string>();
  return [...regeneratedItems, ...recentProposals]
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
    .map((item) => ({ title: item.title, status: item.status }));
}

/** POST …/content-plans/generate: elige la estrategia por el tipo del workspace. */
export async function generateContentPlan(
  workspace: WorkspaceDocument,
  input: GenerateContentPlanData,
  deps: ContentPlanDeps,
): Promise<ContentPlanResponse> {
  assertWorkspaceFeature(
    workspace,
    'contentPlanner',
    'El plan de contenido con Pixel no está disponible en este tipo de Pixel',
  );
  return workspace.type === 'enterprise'
    ? generateEnterprisePlan(workspace, input, deps)
    : generatePersonalPlan(workspace, input, deps);
}

/** Personal: PersonalDNA + proyectos + contenido reciente (comportamiento sin cambios). */
async function generatePersonalPlan(
  workspace: WorkspaceDocument,
  input: GenerateContentPlanData,
  deps: ContentPlanDeps,
): Promise<ContentPlanResponse> {
  if (input.campaignId) throw fieldError('campaignId', 'Un Pixel Personal no tiene campañas');
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
  const [projects, recentContent, previousProposals, creativeMemory] = await Promise.all([
    ProjectModel.find({ workspaceId: workspace._id, status: { $in: ['active', 'planned'] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(PLANNING_CONTEXT_LIMITS.activeProjects),
    ContentItemModel.find({ workspaceId: workspace._id })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(PLANNING_CONTEXT_LIMITS.recentContent),
    previousProposalsFor(workspace, previousPlan, PLANNING_CONTEXT_LIMITS.previousProposals),
    planningMemoryFor(workspace, null),
  ]);

  const proposal = await runPlanner(deps, () =>
    deps.planningEngine.plan({
      workspaceId: workspace._id.toString(),
      personalDna: personalDnaContentOf(personalDna),
      activeProjects: projects.map((project) => toProjectDTO(project)),
      recentContent: recentContent.map(toContentItemDTO),
      previousProposals,
      requestedPeriod: { startDate: input.startDate, endDate: input.endDate },
      desiredFrequency: input.frequency,
      requestedPlatforms: input.platforms,
      requiredFormats: input.formats,
      requestedGoal: input.goal,
      tzOffset: input.tzOffset,
      creativeMemory,
    }),
  );

  return persistGeneratedPlan(workspace, input, {
    plan: {
      contextType: 'personal',
      name: input.name ?? defaultPlanName(input.startDate, input.endDate),
      objective: input.goal?.trim() || null,
      strategySummary: proposal.strategySummary,
      pillars: proposal.pillars,
      targetAudience: proposal.targetAudience,
      platforms: proposal.platforms,
      personalDnaVersion: personalDna.version,
      brandDnaVersion: null,
      campaignId: null,
      campaignStrategyVersion: null,
      editorialObjective: null,
      campaignAlignment: null,
      distributionRationale: null,
      generation: {
        ...proposal.meta,
        discardedItems: proposal.discardedItems,
        frequencyPerWeek: proposal.frequencyPerWeek,
        frequencySource: proposal.frequencySource,
        requestedGoal: input.goal?.trim() || null,
        regeneratedFromPlanId: previousPlan?._id ?? null,
        memoryKeys: proposal.memoryKeys ?? [],
      },
    },
    items: proposal.items.map((item) => ({
      ...item,
      projectId: item.projectId ? new Types.ObjectId(item.projectId) : null,
    })),
  });
}

/**
 * Enterprise: BrandDNA (+ campaña del MISMO workspace con su estrategia vigente y sus piezas) +
 * proyectos reales + contenido reciente. Nunca lee PersonalDNA. Generar no cambia la campaña, su
 * estrategia ni el estado de sus piezas.
 */
async function generateEnterprisePlan(
  workspace: WorkspaceDocument,
  input: GenerateContentPlanData,
  deps: ContentPlanDeps,
): Promise<ContentPlanResponse> {
  const { company, brandDna } = await loadBrandContext(workspace);
  const campaign = input.campaignId
    ? await loadCampaignForPlanning(workspace, input.campaignId)
    : null;
  const previousPlan = input.regenerateFrom
    ? await findPlan(workspace, input.regenerateFrom)
    : null;

  const [projects, recentContent, previousProposals, creativeMemory] = await Promise.all([
    ProjectModel.find({
      workspaceId: workspace._id,
      status: { $in: ['active', 'planned'] },
      // Con campaña, primero sus proyectos; después el resto del trabajo vivo de la marca.
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(ENTERPRISE_PLANNING_LIMITS.activeProjects * 2),
    ContentItemModel.find({ workspaceId: workspace._id })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(ENTERPRISE_PLANNING_LIMITS.recentContent),
    previousProposalsFor(workspace, previousPlan, ENTERPRISE_PLANNING_LIMITS.previousProposals),
    planningMemoryFor(workspace, campaign?.campaign._id.toString() ?? null),
  ]);
  const campaignKey = campaign?.campaign._id.toString();
  const orderedProjects = [...projects]
    .sort(
      (a, b) =>
        Number(b.campaignId?.toString() === campaignKey) -
        Number(a.campaignId?.toString() === campaignKey),
    )
    .slice(0, ENTERPRISE_PLANNING_LIMITS.activeProjects);

  const proposal = await runPlanner(deps, () =>
    deps.enterprisePlanning.plan({
      workspaceId: workspace._id.toString(),
      company: { name: company.name },
      brandDna,
      campaign: campaign
        ? {
            id: campaign.campaign._id.toString(),
            name: campaign.campaign.name,
            objective: campaign.campaign.objective,
            productOrService: campaign.campaign.productOrService,
            channels: [...campaign.campaign.channels],
            strategy: campaign.strategy,
            deliverables: campaign.deliverables,
          }
        : null,
      activeProjects: orderedProjects.map((project) => toProjectDTO(project)),
      recentContent: recentContent.map(toContentItemDTO),
      previousProposals,
      requestedPeriod: { startDate: input.startDate, endDate: input.endDate },
      desiredFrequency: input.frequency,
      requestedPlatforms: input.platforms,
      requiredFormats: input.formats,
      requestedGoal: input.goal,
      tzOffset: input.tzOffset,
      creativeMemory,
    }),
  );

  const campaignId = campaign?.campaign._id ?? null;
  return persistGeneratedPlan(workspace, input, {
    plan: {
      contextType: 'enterprise',
      name:
        input.name ??
        (campaign
          ? `${campaign.campaign.name} · ${defaultPlanName(input.startDate, input.endDate)}`.slice(
              0,
              120,
            )
          : defaultPlanName(input.startDate, input.endDate)),
      objective: input.goal?.trim() || null,
      strategySummary: proposal.strategySummary,
      pillars: proposal.pillars,
      targetAudience: proposal.targetAudience,
      platforms: proposal.platforms,
      personalDnaVersion: null,
      brandDnaVersion: brandDna.version,
      campaignId,
      campaignStrategyVersion: campaign?.strategy.version ?? null,
      editorialObjective: proposal.editorialObjective,
      campaignAlignment: proposal.campaignAlignment,
      distributionRationale: proposal.distributionRationale,
      generation: {
        ...proposal.meta,
        discardedItems: proposal.discardedItems,
        frequencyPerWeek: proposal.frequencyPerWeek,
        frequencySource: proposal.frequencySource,
        requestedGoal: input.goal?.trim() || null,
        regeneratedFromPlanId: previousPlan?._id ?? null,
        memoryKeys: proposal.memoryKeys ?? [],
      },
    },
    items: proposal.items.map((item) => ({
      ...item,
      projectId: item.projectId ? new Types.ObjectId(item.projectId) : null,
      campaignDeliverableId: item.campaignDeliverableId
        ? new Types.ObjectId(item.campaignDeliverableId)
        : null,
      campaignId,
    })),
  });
}

/* ---------- Plan manual y edición ---------- */

export async function createContentPlan(
  workspace: WorkspaceDocument,
  input: CreateContentPlanData,
): Promise<ContentPlanResponse> {
  const plan = await ContentPlanModel.create({
    workspaceId: workspace._id,
    contextType: workspace.type,
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

/**
 * Cambia una propuesta SOLO si aún no está convertida, en una única operación condicionada: una
 * aceptación simultánea no puede dejarla "rechazada" o "propuesta" con su ContentItem ya creado.
 */
async function updateUnconverted(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
  set: Record<string, unknown> | ((item: ContentPlanItemDocument) => Record<string, unknown>),
) {
  const plan = await findPlan(workspace, planId);
  const item = await findItem(workspace, plan, itemId);
  assertNotConverted(item);
  const updated = await ContentPlanItemModel.findOneAndUpdate(
    {
      _id: item._id,
      workspaceId: workspace._id,
      contentPlanId: plan._id,
      convertedContentItemId: null,
    },
    { $set: typeof set === 'function' ? set(item) : set },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) assertNotConverted(await findItem(workspace, plan, itemId));
  return { item: toContentPlanItemDTO(updated ?? item), plan, doc: updated ?? item };
}

const PROPOSAL_FIELDS = ['title', 'hook', 'format', 'platform'] as const;

export async function updateContentPlanItem(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
  input: UpdateContentPlanItemInput,
) {
  const { scheduledFor, status, ...rest } = input;
  const { item } = await updateUnconverted(workspace, planId, itemId, (current) => ({
    ...rest,
    ...(scheduledFor !== undefined
      ? { scheduledFor: scheduledFor ? new Date(scheduledFor) : null }
      : {}),
    ...(status === 'proposed' ? { status: 'proposed', rejectionReason: null } : {}),
    // Creative Memory: la propuesta de Pixel se guarda en la primera edición que la cambia.
    ...(!current.originalProposal &&
    PROPOSAL_FIELDS.some((field) => field in rest && rest[field] !== current[field])
      ? {
          originalProposal: {
            title: current.title,
            hook: current.hook,
            format: current.format,
            platform: current.platform,
          },
        }
      : {}),
  }));
  return { item };
}

export async function rejectContentPlanItem(
  workspace: WorkspaceDocument,
  planId: unknown,
  itemId: unknown,
  reason: string | null | undefined,
) {
  const { item, plan, doc } = await updateUnconverted(workspace, planId, itemId, {
    status: 'rejected',
    rejectionReason: reason ?? null,
  });
  // Evidencia (no memoria): rechazar una pieza es una señal media contra su formato.
  await recordCreativeDecision(workspace, {
    eventType: 'content_plan_item_rejected',
    resourceType: 'content_plan_item',
    resourceId: doc._id,
    contentPlanId: plan._id,
    campaignId: plan.campaignId,
    projectId: doc.projectId,
    signals: formatSignal(doc.format, 'avoid', 'reject', 'medium'),
    before: compact('Pieza', doc.title),
    sourceEventKey: `content-plan-item:${doc._id.toString()}:reject`,
    description: `Quitaste una pieza${doc.format ? ` (${CONTENT_FORMAT_LABELS[doc.format]})` : ''} de «${plan.name}»`,
    metadata: { source: 'content_planner', dimension: 'format', reason: reason ?? null },
  });
  return { item };
}

/** Aceptar una propuesta: tal cual (señal débil) o tras editarla (señal fuerte con su antes/después). */
async function recordAcceptance(
  workspace: WorkspaceDocument,
  plan: ContentPlanDocument,
  item: ContentPlanItemDocument,
) {
  const original = item.originalProposal;
  const base = {
    resourceType: 'content_plan_item',
    resourceId: item._id,
    contentPlanId: plan._id,
    campaignId: plan.campaignId,
    projectId: item.projectId,
  };
  if (original) {
    const signals = dedupe([
      ...placementChangeSignals(original, { format: item.format, platform: item.platform }, 'high'),
      ...textEditSignals(
        `${original.title}\n${original.hook ?? ''}`,
        `${item.title}\n${item.hook ?? ''}`,
        'high',
      ),
    ]);
    await recordCreativeDecision(workspace, {
      ...base,
      eventType: 'content_plan_item_edited_then_accepted',
      signals,
      before: [
        ...compact('Título', original.title),
        ...compact('Hook', original.hook),
        ...compact('Formato', original.format),
      ],
      after: [
        ...compact('Título', item.title),
        ...compact('Hook', item.hook),
        ...compact('Formato', item.format),
      ],
      sourceEventKey: `content-plan-item:${item._id.toString()}:edited_accept`,
      description: `Editaste y aceptaste «${item.title}» en «${plan.name}»`,
      metadata: { source: 'content_planner' },
    });
    return;
  }
  // Tal cual: si Pixel ya lo eligió por una memoria, aceptarlo no la vuelve a confirmar.
  const keys = plan.generation?.memoryKeys ?? [];
  await recordCreativeDecision(workspace, {
    ...base,
    eventType: 'content_plan_item_accepted',
    signals: formatSignal(item.format, 'prefer', 'approve', 'low'),
    sourceEventKey: `content-plan-item:${item._id.toString()}:accept`,
    description: `Aceptaste «${item.title}» de «${plan.name}»`,
    metadata: {
      source: 'content_planner',
      influencedByMemory: Boolean(item.format && keys.includes(`format:${item.format}:prefer`)),
    },
  });
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
          claimed.strategicMessage ? `Mensaje: ${claimed.strategicMessage}` : null,
          claimed.brandRationale ? `Por qué encaja con la marca: ${claimed.brandRationale}` : null,
          claimed.suggestedAngle ? `Ángulo: ${claimed.suggestedAngle}` : null,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 5000),
        projectId: claimed.projectId?.toString() ?? null,
        campaignId: claimed.campaignId?.toString() ?? null,
        scheduledFor: claimed.scheduledFor?.toISOString() ?? null,
        publishedAt: null,
        tags: claimed.pillar ? [claimed.pillar.slice(0, 40)] : [],
      },
      { source: 'pixel', id: contentItemId },
    );
    await recordAcceptance(workspace, plan, claimed);
    return { item: toContentPlanItemDTO(claimed), contentItem, created: true };
  } catch (err) {
    await ContentPlanItemModel.updateOne(
      { _id: item._id, workspaceId: workspace._id, convertedContentItemId: contentItemId },
      { $set: { convertedContentItemId: null, status: previousStatus } },
    );
    throw err;
  }
}
