import {
  datesInOrder,
  deliverableTarget,
  type AcceptCampaignDeliverableResponse,
  type CampaignDeliverable,
  type CampaignDeliverableListQuery,
  type CampaignGenerationResponse,
  type CampaignListQuery,
  type CampaignListResponse,
  type CampaignResponse,
  type CampaignStats,
  type CampaignStrategyResponse,
  type CreateCampaignData,
  type GenerateCampaignData,
  type ProjectType,
  type RegenerateCampaignStrategyData,
  type UpdateCampaignData,
  type UpdateCampaignDeliverableData,
} from '@pixel/contracts';
import { Types, type QueryFilter } from 'mongoose';
import { AppError, notFound } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { BrandDnaModel, toBrandDnaDTO } from '../brand-dna/brandDna.model.js';
import { formatFromText, platformFromText } from '../content-plans/contentPlanning.grounding.js';
import { createContentItem } from '../operations/content.service.js';
import { ContentItemModel, toContentItemDTO } from '../operations/contentItem.model.js';
import { fieldError, resourceId, toDate } from '../operations/operations.scope.js';
import { ProjectModel } from '../operations/project.model.js';
import { createProject, getProject } from '../operations/projects.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { findWorkspaceCompany } from '../workspaces/workspace.service.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import {
  CampaignModel,
  EMPTY_CAMPAIGN_STATS,
  toCampaignDTO,
  type CampaignDocument,
} from './campaign.model.js';
import {
  CampaignDeliverableModel,
  toCampaignDeliverableDTO,
  type CampaignDeliverableDocument,
} from './campaignDeliverable.model.js';
import {
  CAMPAIGN_CONTEXT_LIMITS,
  CampaignStrategyError,
  type CampaignBrief,
  type CampaignStrategyEngine,
  type CampaignStrategyProposal,
} from './campaignStrategy.engine.js';
import { CampaignStrategyModel, toCampaignStrategyDTO } from './campaignStrategy.model.js';

/*
 * Campaign Manager de un workspace Enterprise (docs/CAMPAIGNS.md). Todas las funciones reciben el
 * workspace ya autorizado (requireWorkspaceAccess) y todas las consultas filtran por su workspaceId;
 * estrategias y piezas, además, por su campaignId.
 *
 * - Campaña manual: sin IA (basta nombre y objetivo). Generar con Pixel exige el BrandDNA.
 * - Estrategia versionada: cada generación crea la versión siguiente; las anteriores se conservan.
 * - Piezas: aceptar convierte (content → ContentItem; el resto → Project), de forma explícita e
 *   idempotente; rechazar no borra. Nada cambia sin una acción del usuario.
 * - DELETE de una campaña la ARCHIVA (conserva estrategia, piezas y operaciones vinculadas).
 * - Sin IA disponible no se inventa una estrategia: 503 campaign_generation_unavailable.
 */

export interface CampaignDeps {
  campaignEngine: CampaignStrategyEngine;
  logger: Logger;
}

export const CAMPAIGN_NOT_FOUND = 'Campaña no encontrada';
export const DELIVERABLE_NOT_FOUND = 'Pieza no encontrada';
const DATES_MESSAGE = 'La fecha final no puede ser anterior a la inicial';

function assertCampaigns(workspace: WorkspaceDocument): void {
  assertWorkspaceFeature(
    workspace,
    'campaigns',
    'Las campañas están disponibles solo en un Pixel de empresa',
  );
}

async function findCampaign(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CampaignDocument> {
  assertCampaigns(workspace);
  const campaign = await CampaignModel.findOne({
    _id: resourceId(rawId, CAMPAIGN_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!campaign) throw notFound(CAMPAIGN_NOT_FOUND);
  return campaign;
}

/* ---------- Conteos (sin N+1: tres agregaciones por página) ---------- */

async function campaignStatsFor(
  workspace: WorkspaceDocument,
  campaignIds: Types.ObjectId[],
): Promise<Map<string, CampaignStats>> {
  const stats = new Map<string, CampaignStats>();
  if (campaignIds.length === 0) return stats;
  const match = { workspaceId: workspace._id, campaignId: { $in: campaignIds } };
  const [deliverables, projects, content] = await Promise.all([
    CampaignDeliverableModel.aggregate<{
      _id: Types.ObjectId;
      total: number;
      proposed: number;
      converted: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$campaignId',
          total: { $sum: 1 },
          proposed: { $sum: { $cond: [{ $eq: ['$status', 'proposed'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
        },
      },
    ]),
    ProjectModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$campaignId', count: { $sum: 1 } } },
    ]),
    ContentItemModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$campaignId', count: { $sum: 1 } } },
    ]),
  ]);
  const entry = (id: Types.ObjectId) => {
    const key = id.toString();
    const current = stats.get(key) ?? { ...EMPTY_CAMPAIGN_STATS };
    stats.set(key, current);
    return current;
  };
  for (const group of deliverables) {
    Object.assign(entry(group._id), {
      deliverables: group.total,
      proposedDeliverables: group.proposed,
      convertedDeliverables: group.converted,
    });
  }
  for (const group of projects) entry(group._id).projects = group.count;
  for (const group of content) entry(group._id).contentItems = group.count;
  return stats;
}

async function campaignResponse(
  workspace: WorkspaceDocument,
  campaign: CampaignDocument,
): Promise<CampaignResponse> {
  const stats = await campaignStatsFor(workspace, [campaign._id]);
  return { campaign: toCampaignDTO(campaign, stats.get(campaign._id.toString())) };
}

/* ---------- CRUD ---------- */

export async function createCampaign(
  workspace: WorkspaceDocument,
  input: CreateCampaignData,
): Promise<CampaignResponse> {
  assertCampaigns(workspace);
  const campaign = await CampaignModel.create({
    ...input,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    workspaceId: workspace._id,
    generatedBy: 'manual',
    currentStrategyVersion: null,
    brandDnaVersion: null,
  });
  return campaignResponse(workspace, campaign);
}

export async function listCampaigns(
  workspace: WorkspaceDocument,
  query: CampaignListQuery,
): Promise<CampaignListResponse> {
  assertCampaigns(workspace);
  const filter = {
    workspaceId: workspace._id,
    status: query.status ? { $in: query.status } : { $ne: 'archived' as const },
  };
  const [docs, total] = await Promise.all([
    CampaignModel.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(query.offset)
      .limit(query.limit),
    CampaignModel.countDocuments(filter),
  ]);
  const stats = await campaignStatsFor(
    workspace,
    docs.map((doc) => doc._id),
  );
  return {
    campaigns: docs.map((doc) => toCampaignDTO(doc, stats.get(doc._id.toString()))),
    total,
  };
}

export async function getCampaign(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CampaignResponse> {
  return campaignResponse(workspace, await findCampaign(workspace, rawId));
}

/** Aplica fechas y campos del brief validando el orden de fechas contra lo que quedará guardado. */
function applyCampaignFields(
  campaign: CampaignDocument,
  input: UpdateCampaignData | RegenerateCampaignStrategyData,
): void {
  const { startDate: rawStart, endDate: rawEnd, ...fields } = input;
  const startDate = toDate(rawStart);
  const endDate = toDate(rawEnd);
  const nextStart = startDate === undefined ? campaign.startDate : startDate;
  const nextEnd = endDate === undefined ? campaign.endDate : endDate;
  if (!datesInOrder(nextStart?.toISOString(), nextEnd?.toISOString())) {
    throw fieldError('endDate', DATES_MESSAGE);
  }
  campaign.set({
    ...fields,
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
  });
}

export async function updateCampaign(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: UpdateCampaignData,
): Promise<CampaignResponse> {
  const campaign = await findCampaign(workspace, rawId);
  applyCampaignFields(campaign, input);
  await campaign.save();
  return campaignResponse(workspace, campaign);
}

/** DELETE = archivar (conserva estrategia, piezas y operaciones vinculadas). Idempotente. */
export async function archiveCampaign(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<CampaignResponse> {
  const campaign = await findCampaign(workspace, rawId);
  if (campaign.status !== 'archived') {
    campaign.status = 'archived';
    await campaign.save();
  }
  return campaignResponse(workspace, campaign);
}

/* ---------- Generación con Pixel ---------- */

function strategyErrorToHttp(err: CampaignStrategyError): AppError {
  return err.kind === 'unavailable'
    ? new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'La generación de campañas no está disponible ahora mismo. Puedes crear la campaña a mano',
        { reason: 'campaign_generation_unavailable' },
      )
    : new AppError(
        502,
        'INTERNAL_ERROR',
        'Pixel no pudo construir una estrategia fundamentada. Inténtalo de nuevo',
        { reason: 'campaign_generation_failed' },
      );
}

/** Empresa y BrandDNA vigente del workspace; sin ellos no se genera nada (409). */
async function loadBrandContext(workspace: WorkspaceDocument) {
  const company = await findWorkspaceCompany(workspace);
  if (!company) {
    throw new AppError(
      409,
      'CONFLICT',
      'Este Pixel de empresa aún no tiene una empresa configurada',
      {
        reason: 'enterprise_company_missing',
      },
    );
  }
  const dnaDoc = company.brandDnaVersion
    ? await BrandDnaModel.findOne({ companyId: company._id, version: company.brandDnaVersion })
    : null;
  if (!dnaDoc) {
    throw new AppError(
      409,
      'CONFLICT',
      'Pixel aún no conoce esta marca: completa el onboarding para crear campañas con él',
      { reason: 'brand_dna_missing' },
    );
  }
  return { company, brandDna: toBrandDnaDTO(dnaDoc) };
}

function briefOf(campaign: {
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
  startDate: Date | null;
  endDate: Date | null;
}): CampaignBrief {
  return {
    objective: campaign.objective,
    campaignType: campaign.campaignType,
    productOrService: campaign.productOrService,
    description: campaign.description,
    targetAudience: [...campaign.targetAudience],
    problem: campaign.problem,
    desiredOutcome: campaign.desiredOutcome,
    channels: [...campaign.channels],
    constraints: [...campaign.constraints],
    mandatoryElements: [...campaign.mandatoryElements],
    references: [...campaign.references],
    startDate: campaign.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: campaign.endDate?.toISOString().slice(0, 10) ?? null,
  };
}

/** Contexto acotado del workspace para no repetir (campañas, proyectos y contenido recientes). */
async function generationContext(workspace: WorkspaceDocument, excludeCampaign?: Types.ObjectId) {
  const [campaigns, projects, content] = await Promise.all([
    CampaignModel.find({
      workspaceId: workspace._id,
      ...(excludeCampaign ? { _id: { $ne: excludeCampaign } } : {}),
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(CAMPAIGN_CONTEXT_LIMITS.recentCampaigns),
    ProjectModel.find({ workspaceId: workspace._id, status: { $in: ['active', 'planned'] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(CAMPAIGN_CONTEXT_LIMITS.activeProjects)
      .select({ name: 1, type: 1, status: 1 }),
    ContentItemModel.find({ workspaceId: workspace._id })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(CAMPAIGN_CONTEXT_LIMITS.recentContent)
      .select({ title: 1, platform: 1, format: 1 }),
  ]);
  const strategies = await Promise.all(
    campaigns.map((campaign) =>
      campaign.currentStrategyVersion
        ? CampaignStrategyModel.findOne({
            workspaceId: workspace._id,
            campaignId: campaign._id,
            version: campaign.currentStrategyVersion,
          }).select({ concept: 1, keyMessage: 1 })
        : null,
    ),
  );
  return {
    recentCampaigns: campaigns.map((campaign, index) => ({
      name: campaign.name,
      objective: campaign.objective,
      concept: strategies[index]?.concept ?? null,
      keyMessage: strategies[index]?.keyMessage ?? campaign.keyMessage ?? null,
    })),
    activeProjects: projects.map((project) => ({
      name: project.name,
      type: project.type,
      status: project.status,
    })),
    recentContent: content.map((item) => ({
      title: item.title,
      platform: item.platform ?? null,
      format: item.format ?? null,
    })),
  };
}

async function runEngine(
  deps: CampaignDeps,
  input: Parameters<CampaignStrategyEngine['generate']>[0],
): Promise<CampaignStrategyProposal> {
  try {
    return await deps.campaignEngine.generate(input);
  } catch (err) {
    if (err instanceof CampaignStrategyError) throw strategyErrorToHttp(err);
    throw err;
  }
}

/** Guarda una versión de la estrategia y sus piezas; si las piezas fallan, deshace la versión. */
async function persistStrategy(
  workspace: WorkspaceDocument,
  campaign: CampaignDocument,
  version: number,
  brandDnaVersion: number,
  proposal: CampaignStrategyProposal,
) {
  const strategy = await CampaignStrategyModel.create({
    ...proposal.strategy,
    workspaceId: workspace._id,
    campaignId: campaign._id,
    version,
    brandDnaVersion,
    generation: {
      ...proposal.meta,
      discardedDeliverables: proposal.discardedDeliverables,
      discardedClaims: proposal.discardedClaims,
    },
  });
  try {
    const deliverables = await CampaignDeliverableModel.insertMany(
      proposal.deliverables.map((item, position) => ({
        ...item,
        workspaceId: workspace._id,
        campaignId: campaign._id,
        strategyVersion: version,
        status: 'proposed',
        position,
      })),
    );
    return { strategy, deliverables };
  } catch (err) {
    // Sin piezas la versión no sirve: no se deja a medias (ni piezas sueltas).
    await Promise.all([
      CampaignDeliverableModel.deleteMany({
        workspaceId: workspace._id,
        campaignId: campaign._id,
        strategyVersion: version,
      }),
      CampaignStrategyModel.deleteOne({ _id: strategy._id, workspaceId: workspace._id }),
    ]);
    throw err;
  }
}

async function generationResponse(
  workspace: WorkspaceDocument,
  campaign: CampaignDocument,
  persisted: Awaited<ReturnType<typeof persistStrategy>>,
): Promise<CampaignGenerationResponse> {
  const { campaign: dto } = await campaignResponse(workspace, campaign);
  return {
    campaign: dto,
    strategy: toCampaignStrategyDTO(persisted.strategy),
    deliverables: persisted.deliverables.map((doc) =>
      toCampaignDeliverableDTO(doc as CampaignDeliverableDocument),
    ),
  };
}

const defaultCampaignName = (objective: string) =>
  objective.length > 110 ? `${objective.slice(0, 109).trimEnd()}…` : objective;

/** POST …/campaigns/generate: campaña nueva + estrategia v1 + piezas, o nada si falla. */
export async function generateCampaign(
  workspace: WorkspaceDocument,
  input: GenerateCampaignData,
  deps: CampaignDeps,
): Promise<CampaignGenerationResponse> {
  assertCampaigns(workspace);
  const { company, brandDna } = await loadBrandContext(workspace);
  const brief = briefOf({
    ...input,
    startDate: toDate(input.startDate) ?? null,
    endDate: toDate(input.endDate) ?? null,
  });
  const context = await generationContext(workspace);
  const proposal = await runEngine(deps, {
    workspaceId: workspace._id.toString(),
    company: { name: company.name },
    brandDna,
    brief,
    previousVersions: [],
    ...context,
  });

  const { name, ...fields } = input;
  const campaign = await CampaignModel.create({
    ...fields,
    name: name ?? defaultCampaignName(input.objective),
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    workspaceId: workspace._id,
    status: 'draft',
    keyMessage: proposal.strategy.keyMessage.slice(0, 200),
    generatedBy: 'pixel',
    brandDnaVersion: brandDna.version,
    currentStrategyVersion: 1,
  });
  try {
    const persisted = await persistStrategy(workspace, campaign, 1, brandDna.version, proposal);
    deps.logger.info('Campaign Manager: campaña generada', {
      workspaceId: workspace._id.toString(),
      workspaceType: workspace.type,
      resourceType: 'campaign',
      mode: proposal.meta.mode,
      deliverables: persisted.deliverables.length,
    });
    return generationResponse(workspace, campaign, persisted);
  } catch (err) {
    await CampaignModel.deleteOne({ _id: campaign._id, workspaceId: workspace._id });
    throw err;
  }
}

/**
 * POST …/:campaignId/strategy/generate: versión siguiente de la estrategia. Los cambios del brief
 * del cuerpo se guardan solo si la generación sale bien. Dos regeneraciones simultáneas no pueden
 * crear la misma versión (índice único): la segunda responde 409.
 */
export async function regenerateCampaignStrategy(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: RegenerateCampaignStrategyData,
  deps: CampaignDeps,
): Promise<CampaignGenerationResponse> {
  const campaign = await findCampaign(workspace, rawId);
  const { company, brandDna } = await loadBrandContext(workspace);
  applyCampaignFields(campaign, input);

  const [latest, previous, context] = await Promise.all([
    CampaignStrategyModel.findOne({ workspaceId: workspace._id, campaignId: campaign._id })
      .sort({ version: -1 })
      .select({ version: 1 }),
    CampaignStrategyModel.find({ workspaceId: workspace._id, campaignId: campaign._id })
      .sort({ version: -1 })
      .limit(CAMPAIGN_CONTEXT_LIMITS.previousVersions)
      .select({ bigIdea: 1, concept: 1, keyMessage: 1 }),
    generationContext(workspace, campaign._id),
  ]);
  const proposal = await runEngine(deps, {
    workspaceId: workspace._id.toString(),
    company: { name: company.name },
    brandDna,
    brief: briefOf(campaign),
    previousVersions: previous.map((version) => ({
      bigIdea: version.bigIdea,
      concept: version.concept,
      keyMessage: version.keyMessage,
    })),
    ...context,
  });

  const version = (latest?.version ?? 0) + 1;
  let persisted;
  try {
    persisted = await persistStrategy(workspace, campaign, version, brandDna.version, proposal);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(409, 'CONFLICT', 'Ya se está generando otra versión de esta estrategia', {
        reason: 'campaign_strategy_generation_in_progress',
      });
    }
    throw err;
  }
  campaign.currentStrategyVersion = Math.max(campaign.currentStrategyVersion ?? 0, version);
  campaign.brandDnaVersion = brandDna.version;
  campaign.keyMessage = proposal.strategy.keyMessage.slice(0, 200);
  await campaign.save();
  return generationResponse(workspace, campaign, persisted);
}

export async function getCampaignStrategy(
  workspace: WorkspaceDocument,
  rawId: unknown,
  requested: number | undefined,
): Promise<CampaignStrategyResponse> {
  const campaign = await findCampaign(workspace, rawId);
  const versions = await CampaignStrategyModel.find({
    workspaceId: workspace._id,
    campaignId: campaign._id,
  })
    .sort({ version: 1 })
    .select({ version: 1 });
  const version = requested ?? campaign.currentStrategyVersion;
  const strategy = version
    ? await CampaignStrategyModel.findOne({
        workspaceId: workspace._id,
        campaignId: campaign._id,
        version,
      })
    : null;
  if (requested && !strategy) throw notFound('Versión de estrategia no encontrada');
  return {
    strategy: strategy ? toCampaignStrategyDTO(strategy) : null,
    versions: versions.map((doc) => doc.version),
  };
}

/* ---------- Piezas ---------- */

export async function listCampaignDeliverables(
  workspace: WorkspaceDocument,
  rawId: unknown,
  query: CampaignDeliverableListQuery,
): Promise<{ deliverables: CampaignDeliverable[] }> {
  const campaign = await findCampaign(workspace, rawId);
  const filter: QueryFilter<CampaignDeliverableDocument> = {
    workspaceId: workspace._id,
    campaignId: campaign._id,
    ...(query.status ? { status: { $in: query.status } } : {}),
    // Por defecto: las de la estrategia vigente y las ya convertidas de versiones anteriores.
    ...(query.strategyVersion
      ? { strategyVersion: query.strategyVersion }
      : {
          $or: [
            { strategyVersion: campaign.currentStrategyVersion },
            { strategyVersion: null },
            { status: 'converted' },
          ],
        }),
  };
  const docs = await CampaignDeliverableModel.find(filter)
    .sort({ strategyVersion: -1, position: 1, _id: 1 })
    .limit(100);
  return { deliverables: docs.map(toCampaignDeliverableDTO) };
}

const deliverableId = (raw: unknown) => resourceId(raw, DELIVERABLE_NOT_FOUND);

async function findDeliverable(
  workspace: WorkspaceDocument,
  campaign: CampaignDocument,
  rawId: unknown,
): Promise<CampaignDeliverableDocument> {
  const deliverable = await CampaignDeliverableModel.findOne({
    _id: deliverableId(rawId),
    workspaceId: workspace._id,
    campaignId: campaign._id,
  });
  if (!deliverable) throw notFound(DELIVERABLE_NOT_FOUND);
  return deliverable;
}

const convertedConflict = () =>
  new AppError(
    409,
    'CONFLICT',
    'Esta pieza ya está en ejecución: edítala en Proyectos o Contenido',
    {
      reason: 'campaign_deliverable_converted',
    },
  );

/**
 * Editar o rechazar solo mientras NO esté convertida, en una única operación condicionada: no hay
 * carrera con una aceptación simultánea (nunca queda "rechazada" con su recurso ya creado).
 */
async function updateUnconverted(
  workspace: WorkspaceDocument,
  campaignId: unknown,
  rawId: unknown,
  set: Record<string, unknown>,
) {
  const campaign = await findCampaign(workspace, campaignId);
  const id = deliverableId(rawId);
  const updated = await CampaignDeliverableModel.findOneAndUpdate(
    {
      _id: id,
      workspaceId: workspace._id,
      campaignId: campaign._id,
      convertedProjectId: null,
      convertedContentItemId: null,
    },
    { $set: set },
    { returnDocument: 'after', runValidators: true },
  );
  if (updated) return { deliverable: toCampaignDeliverableDTO(updated) };
  await findDeliverable(workspace, campaign, rawId); // 404 si no existe en esta campaña
  throw convertedConflict();
}

export function updateCampaignDeliverable(
  workspace: WorkspaceDocument,
  campaignId: unknown,
  rawId: unknown,
  input: UpdateCampaignDeliverableData,
) {
  return updateUnconverted(workspace, campaignId, rawId, input);
}

export function rejectCampaignDeliverable(
  workspace: WorkspaceDocument,
  campaignId: unknown,
  rawId: unknown,
) {
  return updateUnconverted(workspace, campaignId, rawId, { status: 'rejected' });
}

/** Tipo de proyecto para una pieza de producción (clasificación humana, editable después). */
const PROJECT_TYPE_FOR: Record<string, ProjectType> = {
  design: 'creative',
  video: 'creative',
  photo: 'creative',
  web: 'creative',
  print: 'creative',
  event: 'event',
  other: 'campaign',
};

async function existingConversion(
  workspace: WorkspaceDocument,
  deliverable: CampaignDeliverableDocument,
): Promise<AcceptCampaignDeliverableResponse> {
  const [contentItem, project] = await Promise.all([
    deliverable.convertedContentItemId
      ? ContentItemModel.findOne({
          _id: deliverable.convertedContentItemId,
          workspaceId: workspace._id,
        })
      : null,
    deliverable.convertedProjectId
      ? getProject(workspace, deliverable.convertedProjectId.toString()).catch(() => null)
      : null,
  ]);
  return {
    deliverable: toCampaignDeliverableDTO(deliverable),
    created: false,
    contentItem: contentItem ? toContentItemDTO(contentItem) : null,
    project,
  };
}

/**
 * Pieza → Operation del MISMO workspace con `campaignId` (explícito e idempotente):
 * 1. reserva atómica del id del recurso (`converted*Id: null → nuevoId`): solo una llamada gana;
 * 2. crea el ContentItem (type content; status idea, source pixel) o el Project (el resto; planned)
 *    con ese id;
 * 3. si la creación falla, deshace la reserva. Una segunda llamada devuelve lo existente.
 */
export async function acceptCampaignDeliverable(
  workspace: WorkspaceDocument,
  campaignId: unknown,
  rawId: unknown,
): Promise<AcceptCampaignDeliverableResponse> {
  const campaign = await findCampaign(workspace, campaignId);
  const deliverable = await findDeliverable(workspace, campaign, rawId);
  if (deliverable.convertedContentItemId || deliverable.convertedProjectId) {
    return existingConversion(workspace, deliverable);
  }

  const target = deliverableTarget(deliverable.type);
  const field = target === 'content_item' ? 'convertedContentItemId' : 'convertedProjectId';
  const resourceIdToCreate = new Types.ObjectId();
  const previousStatus = deliverable.status;
  const claimed = await CampaignDeliverableModel.findOneAndUpdate(
    {
      _id: deliverable._id,
      workspaceId: workspace._id,
      campaignId: campaign._id,
      convertedContentItemId: null,
      convertedProjectId: null,
    },
    { $set: { [field]: resourceIdToCreate, status: 'converted' } },
    { returnDocument: 'after' },
  );
  if (!claimed) {
    return existingConversion(workspace, await findDeliverable(workspace, campaign, rawId));
  }

  const notes = [
    `Pieza de la campaña «${campaign.name}».`,
    claimed.rationale ? `Por qué: ${claimed.rationale}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    if (target === 'content_item') {
      const platform = claimed.platform ? platformFromText(claimed.platform) : null;
      const contentItem = await createContentItem(
        workspace,
        {
          title: claimed.title,
          concept: claimed.description,
          objective: claimed.objective,
          platform,
          format: claimed.format ? formatFromText(claimed.format) : null,
          status: 'idea',
          hook: null,
          caption: null,
          script: null,
          notes: notes.slice(0, 5000),
          projectId: null,
          campaignId: campaign._id.toString(),
          scheduledFor: null,
          publishedAt: null,
          tags: [],
        },
        { source: 'pixel', id: resourceIdToCreate },
      );
      return {
        deliverable: toCampaignDeliverableDTO(claimed),
        created: true,
        contentItem,
        project: null,
      };
    }
    const project = await createProject(
      workspace,
      {
        name: claimed.title.slice(0, 120),
        description:
          [claimed.description, claimed.objective ? `Objetivo: ${claimed.objective}` : null, notes]
            .filter(Boolean)
            .join('\n')
            .slice(0, 2000) || null,
        type: PROJECT_TYPE_FOR[claimed.type] ?? 'campaign',
        status: 'planned',
        priority: 'medium',
        goals: claimed.objective ? [claimed.objective.slice(0, 160)] : [],
        startDate: campaign.startDate?.toISOString() ?? null,
        dueDate: campaign.endDate?.toISOString() ?? null,
        campaignId: campaign._id.toString(),
      },
      { id: resourceIdToCreate },
    );
    return {
      deliverable: toCampaignDeliverableDTO(claimed),
      created: true,
      contentItem: null,
      project,
    };
  } catch (err) {
    await CampaignDeliverableModel.updateOne(
      { _id: claimed._id, workspaceId: workspace._id, [field]: resourceIdToCreate },
      { $set: { [field]: null, status: previousStatus } },
    );
    throw err;
  }
}
