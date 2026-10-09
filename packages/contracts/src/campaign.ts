import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import {
  datesInOrder,
  OptionalDateInputSchema,
  operationText,
  operationTitle,
  queryEnumList,
  queryLimit,
  queryOffset,
} from './operations.js';

/*
 * Campaign Manager (Enterprise). Una Campaign es una entidad ESTRATÉGICA del workspace: el objetivo,
 * el brief y la estrategia (CampaignStrategy, versionada) de una necesidad de negocio. La ejecución
 * sigue en las Operations compartidas: sus piezas propuestas (CampaignDeliverable) se convierten en
 * Projects o ContentItems con `campaignId`. Campaign ≠ Project. Ver docs/CAMPAIGNS.md.
 */

export const CampaignStatusSchema = z.enum([
  'draft',
  'planned',
  'active',
  'paused',
  'completed',
  'archived',
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignTypeSchema = z.enum([
  'launch',
  'brand_awareness',
  'engagement',
  'lead_generation',
  'sales',
  'event',
  'education',
  'rebranding',
  'seasonal',
  'other',
]);
export type CampaignType = z.infer<typeof CampaignTypeSchema>;

export const CampaignGeneratedBySchema = z.enum(['manual', 'pixel']);
export type CampaignGeneratedBy = z.infer<typeof CampaignGeneratedBySchema>;

/** Conteos derivados (siempre del mismo workspace). */
export const CampaignStatsSchema = z.object({
  deliverables: z.number().int().min(0),
  proposedDeliverables: z.number().int().min(0),
  convertedDeliverables: z.number().int().min(0),
  projects: z.number().int().min(0),
  contentItems: z.number().int().min(0),
});
export type CampaignStats = z.infer<typeof CampaignStatsSchema>;

export const CampaignSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  status: CampaignStatusSchema,
  objective: z.string(),
  campaignType: CampaignTypeSchema.nullable(),
  productOrService: z.string().nullable(),
  targetAudience: z.array(z.string()),
  keyMessage: z.string().nullable(),
  startDate: IsoDateSchema.nullable(),
  endDate: IsoDateSchema.nullable(),
  /** Brief (lo que pidió el usuario; la IA lo recibe tal cual). */
  problem: z.string().nullable(),
  desiredOutcome: z.string().nullable(),
  channels: z.array(z.string()),
  constraints: z.array(z.string()),
  mandatoryElements: z.array(z.string()),
  references: z.array(z.string()),
  /** BrandDNA con el que se generó la estrategia vigente (null si nunca se generó). */
  brandDnaVersion: z.number().int().min(1).nullable(),
  generatedBy: CampaignGeneratedBySchema,
  /** Versión vigente de CampaignStrategy (null = sin estrategia). */
  currentStrategyVersion: z.number().int().min(1).nullable(),
  stats: CampaignStatsSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Lista de textos cortos: recorta y quita vacíos. */
const textList = (maxItems: number, maxChars: number) =>
  z
    .array(z.string().trim().max(maxChars, `Cada elemento admite máximo ${maxChars} caracteres`))
    .transform((items) => items.filter(Boolean))
    .pipe(z.array(z.string()).max(maxItems, `Máximo ${maxItems} elementos`));

/** Campos del brief (todos opcionales salvo el objetivo). */
const briefFields = {
  objective: operationTitle('el objetivo de la campaña', 500),
  campaignType: CampaignTypeSchema.nullable(),
  productOrService: operationText(200),
  description: operationText(2000),
  targetAudience: textList(8, 160),
  problem: operationText(1000),
  desiredOutcome: operationText(1000),
  channels: textList(8, 60),
  constraints: textList(10, 200),
  mandatoryElements: textList(10, 200),
  references: textList(10, 200),
  startDate: OptionalDateInputSchema,
  endDate: OptionalDateInputSchema,
};

const briefDefaults = {
  campaignType: briefFields.campaignType.default(null),
  productOrService: briefFields.productOrService.default(null),
  description: briefFields.description.default(null),
  targetAudience: briefFields.targetAudience.default([]),
  problem: briefFields.problem.default(null),
  desiredOutcome: briefFields.desiredOutcome.default(null),
  channels: briefFields.channels.default([]),
  constraints: briefFields.constraints.default([]),
  mandatoryElements: briefFields.mandatoryElements.default([]),
  references: briefFields.references.default([]),
  startDate: briefFields.startDate.default(null),
  endDate: briefFields.endDate.default(null),
};

const campaignDatesInOrder = (value: { startDate?: string | null; endDate?: string | null }) =>
  datesInOrder(value.startDate, value.endDate);
const DATES_MESSAGE = {
  message: 'La fecha final no puede ser anterior a la inicial',
  path: ['endDate'],
};

const campaignName = operationTitle('el nombre de la campaña', 120);

/**
 * POST /api/workspaces/:workspaceId/campaigns — campaña manual (sin IA). Bastan nombre y objetivo.
 * `strict`: workspaceId, generatedBy o currentStrategyVersion en el cuerpo son un 400.
 */
export const CreateCampaignSchema = z
  .object({
    name: campaignName,
    objective: briefFields.objective,
    status: CampaignStatusSchema.default('draft'),
    keyMessage: operationText(200).default(null),
    ...briefDefaults,
  })
  .strict()
  .refine(campaignDatesInOrder, DATES_MESSAGE);
export type CreateCampaignInput = z.input<typeof CreateCampaignSchema>;
export type CreateCampaignData = z.output<typeof CreateCampaignSchema>;

/**
 * POST …/campaigns/generate — Pixel construye la estrategia desde el BrandDNA. Basta el objetivo
 * (el nombre se deriva si falta). La campaña se crea en `draft` con su estrategia v1 y sus piezas.
 */
export const GenerateCampaignSchema = z
  .object({
    name: campaignName.optional(),
    objective: briefFields.objective,
    ...briefDefaults,
  })
  .strict()
  .refine(campaignDatesInOrder, DATES_MESSAGE);
export type GenerateCampaignInput = z.input<typeof GenerateCampaignSchema>;
export type GenerateCampaignData = z.output<typeof GenerateCampaignSchema>;

/** PATCH …/campaigns/:campaignId. Las fechas se validan también contra lo guardado. */
export const UpdateCampaignSchema = z
  .object({
    name: campaignName,
    status: CampaignStatusSchema,
    keyMessage: operationText(200),
    ...briefFields,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar')
  .refine(campaignDatesInOrder, DATES_MESSAGE);
export type UpdateCampaignInput = z.input<typeof UpdateCampaignSchema>;
export type UpdateCampaignData = z.output<typeof UpdateCampaignSchema>;

/**
 * POST …/campaigns/:campaignId/strategy/generate — nueva versión de la estrategia. Acepta cambios
 * opcionales del brief (se guardan en la campaña antes de generar); un cuerpo vacío regenera.
 */
export const RegenerateCampaignStrategySchema = z
  .object(briefFields)
  .partial()
  .strict()
  .refine(campaignDatesInOrder, DATES_MESSAGE);
export type RegenerateCampaignStrategyInput = z.input<typeof RegenerateCampaignStrategySchema>;
export type RegenerateCampaignStrategyData = z.output<typeof RegenerateCampaignStrategySchema>;

/** GET …/campaigns. Sin `status`, excluye las archivadas. Orden: actualizadas recientemente. */
export const CampaignListQuerySchema = z.object({
  status: queryEnumList(CampaignStatusSchema),
  limit: queryLimit,
  offset: queryOffset,
});
export type CampaignListQuery = z.output<typeof CampaignListQuerySchema>;

export const CampaignResponseSchema = z.object({ campaign: CampaignSchema });
export type CampaignResponse = z.infer<typeof CampaignResponseSchema>;

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignSchema),
  total: z.number().int().min(0),
});
export type CampaignListResponse = z.infer<typeof CampaignListResponseSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  planned: 'Planificada',
  active: 'Activa',
  paused: 'En pausa',
  completed: 'Completada',
  archived: 'Archivada',
};

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  launch: 'Lanzamiento',
  brand_awareness: 'Reconocimiento de marca',
  engagement: 'Conversación',
  lead_generation: 'Captación',
  sales: 'Ventas',
  event: 'Evento',
  education: 'Educación',
  rebranding: 'Rebranding',
  seasonal: 'Temporada',
  other: 'Otra',
};
