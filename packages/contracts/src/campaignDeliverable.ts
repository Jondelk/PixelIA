import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { ContentItemSchema } from './contentItem.js';
import { operationText, operationTitle, queryEnumList } from './operations.js';
import { ProjectSchema } from './project.js';

/*
 * CampaignDeliverable: lo que la campaña NECESITA (propuesto por la estrategia). No es una pieza en
 * producción: solo al aceptarla se convierte, de forma explícita e idempotente, en una Operation
 * del mismo workspace con `campaignId`:
 *   type = content            → ContentItem (status idea, source pixel)
 *   design · video · photo · web · print · event · other → Project (status planned)
 * Ver docs/CAMPAIGNS.md.
 */

export const CampaignDeliverableTypeSchema = z.enum([
  'content',
  'design',
  'video',
  'photo',
  'web',
  'print',
  'event',
  'other',
]);
export type CampaignDeliverableType = z.infer<typeof CampaignDeliverableTypeSchema>;

/**
 * `accepted` está reservado (aceptación sin convertir): hoy aceptar convierte en el acto
 * (`converted`). No es una aprobación formal: eso llegará con Creative Workflow.
 */
export const CampaignDeliverableStatusSchema = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'converted',
]);
export type CampaignDeliverableStatus = z.infer<typeof CampaignDeliverableStatusSchema>;

export type DeliverableTarget = 'content_item' | 'project';

/** A qué se convierte una pieza al aceptarla (regla única de la API y la UI). */
export function deliverableTarget(type: CampaignDeliverableType): DeliverableTarget {
  return type === 'content' ? 'content_item' : 'project';
}

export const CampaignDeliverableSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  campaignId: ObjectIdSchema,
  /** Versión de la estrategia que la propuso (null = añadida a mano). */
  strategyVersion: z.number().int().min(1).nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: CampaignDeliverableTypeSchema,
  platform: z.string().nullable(),
  format: z.string().nullable(),
  objective: z.string().nullable(),
  /** Por qué la estrategia la propone. */
  rationale: z.string().nullable(),
  status: CampaignDeliverableStatusSchema,
  position: z.number().int().min(0),
  convertedProjectId: ObjectIdSchema.nullable(),
  convertedContentItemId: ObjectIdSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type CampaignDeliverable = z.infer<typeof CampaignDeliverableSchema>;

/** PATCH …/deliverables/:deliverableId — solo antes de convertirla (después → 409). */
export const UpdateCampaignDeliverableSchema = z
  .object({
    title: operationTitle('el título de la pieza'),
    description: operationText(600),
    type: CampaignDeliverableTypeSchema,
    platform: operationText(60),
    format: operationText(60),
    objective: operationText(300),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateCampaignDeliverableInput = z.input<typeof UpdateCampaignDeliverableSchema>;
export type UpdateCampaignDeliverableData = z.output<typeof UpdateCampaignDeliverableSchema>;

/**
 * GET …/deliverables. Sin `strategyVersion`, las de la estrategia vigente (más las convertidas de
 * versiones anteriores, que ya son trabajo real). `strategyVersion=n` = solo las de esa versión.
 */
export const CampaignDeliverableListQuerySchema = z.object({
  strategyVersion: z.coerce.number().int().min(1).optional(),
  status: queryEnumList(CampaignDeliverableStatusSchema),
});
export type CampaignDeliverableListQuery = z.output<typeof CampaignDeliverableListQuerySchema>;

export const CampaignDeliverableResponseSchema = z.object({
  deliverable: CampaignDeliverableSchema,
});
export type CampaignDeliverableResponse = z.infer<typeof CampaignDeliverableResponseSchema>;

export const CampaignDeliverableListResponseSchema = z.object({
  deliverables: z.array(CampaignDeliverableSchema),
});
export type CampaignDeliverableListResponse = z.infer<typeof CampaignDeliverableListResponseSchema>;

/** POST …/accept: 201 si creó el recurso, 200 si ya existía (idempotente). */
export const AcceptCampaignDeliverableResponseSchema = z.object({
  deliverable: CampaignDeliverableSchema,
  created: z.boolean(),
  contentItem: ContentItemSchema.nullable(),
  project: ProjectSchema.nullable(),
});
export type AcceptCampaignDeliverableResponse = z.infer<
  typeof AcceptCampaignDeliverableResponseSchema
>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const CAMPAIGN_DELIVERABLE_TYPE_LABELS: Record<CampaignDeliverableType, string> = {
  content: 'Contenido',
  design: 'Diseño',
  video: 'Video',
  photo: 'Fotografía',
  web: 'Web',
  print: 'Impreso',
  event: 'Evento',
  other: 'Otro',
};

export const CAMPAIGN_DELIVERABLE_STATUS_LABELS: Record<CampaignDeliverableStatus, string> = {
  proposed: 'Propuesta',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  converted: 'En ejecución',
};
