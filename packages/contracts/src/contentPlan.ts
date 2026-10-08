import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { ContentFormatSchema, ContentItemSchema, ContentPlatformSchema } from './contentItem.js';
import {
  operationText,
  operationTitle,
  queryEnumList,
  queryLimit,
  queryOffset,
} from './operations.js';

/*
 * Content Planner: Pixel propone una ESTRATEGIA de contenido (ContentPlan) con propuestas
 * justificadas (ContentPlanItem). Una propuesta no es una pieza: solo al aceptarla se convierte en
 * un ContentItem (source = pixel). Recursos del workspace (aislados por workspaceId); hoy solo un
 * workspace personal puede generarlos con Pixel. Ver docs/CONTENT-PLANNER.md.
 */

export const CONTENT_PLAN_MAX_DAYS = 30;
export const CONTENT_PLAN_MAX_ITEMS = 30;
export const CONTENT_PLAN_MAX_FREQUENCY = 14;
/** Frecuencia por defecto si ni la petición ni el ADN la indican (fallback documentado). */
export const CONTENT_PLAN_DEFAULT_FREQUENCY = 3;

export const ContentPlanStatusSchema = z.enum(['draft', 'active', 'completed', 'archived']);
export type ContentPlanStatus = z.infer<typeof ContentPlanStatusSchema>;

export const ContentPlanGeneratedBySchema = z.enum(['manual', 'pixel']);
export type ContentPlanGeneratedBy = z.infer<typeof ContentPlanGeneratedBySchema>;

export const ContentPlanItemStatusSchema = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'converted',
]);
export type ContentPlanItemStatus = z.infer<typeof ContentPlanItemStatusSchema>;

/** Tipo de ángulo de una propuesta: sirve para variar el plan (no todo "Cómo hacer X"). */
export const ContentAngleSchema = z.enum([
  'education',
  'opinion',
  'process',
  'case',
  'behind_the_scenes',
  'reflection',
  'portfolio',
  'comparison',
  'storytelling',
]);
export type ContentAngle = z.infer<typeof ContentAngleSchema>;

/** Día local "YYYY-MM-DD" (los periodos se eligen por días, no por horas). */
export const DayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha AAAA-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Fecha inválida');

/** Días entre dos fechas "YYYY-MM-DD", ambos incluidos. */
export function periodDays(startDate: string, endDate: string): number {
  return (
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
    ) + 1
  );
}

const periodRefinement = <T extends { startDate: string; endDate: string }>(schema: z.ZodType<T>) =>
  schema
    .refine((value) => periodDays(value.startDate, value.endDate) >= 1, {
      message: 'La fecha final no puede ser anterior a la inicial',
      path: ['endDate'],
    })
    .refine((value) => periodDays(value.startDate, value.endDate) <= CONTENT_PLAN_MAX_DAYS, {
      message: `El periodo admite como máximo ${CONTENT_PLAN_MAX_DAYS} días`,
      path: ['endDate'],
    });

export const ContentPillarSchema = z.object({
  name: z.string(),
  rationale: z.string(),
});
export type ContentPillar = z.infer<typeof ContentPillarSchema>;

/** Cómo se generó un plan con Pixel (transparencia: modelo real o modo demo). */
export const ContentPlanGenerationSchema = z.object({
  provider: z.string(),
  model: z.string(),
  mode: z.enum(['ai', 'demo']),
  /** Propuestas descartadas por la validación (datos no fundamentados, plataforma no permitida…). */
  discardedItems: z.number().int().min(0),
  frequencyPerWeek: z.number().int().min(1),
  /** De dónde salió la frecuencia: la petición, el ADN o el valor por defecto. */
  frequencySource: z.enum(['request', 'personal_dna', 'default']),
  requestedGoal: z.string().nullable(),
  /** Plan del que se regeneró (si aplica). */
  regeneratedFromPlanId: ObjectIdSchema.nullable(),
});
export type ContentPlanGeneration = z.infer<typeof ContentPlanGenerationSchema>;

export const ContentPlanItemCountsSchema = z.object({
  proposed: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  converted: z.number().int().min(0),
});
export type ContentPlanItemCounts = z.infer<typeof ContentPlanItemCountsSchema>;

export const ContentPlanSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  name: z.string(),
  objective: z.string().nullable(),
  period: z.object({ startDate: DayStringSchema, endDate: DayStringSchema }),
  strategySummary: z.string().nullable(),
  pillars: z.array(ContentPillarSchema),
  targetAudience: z.array(z.string()),
  platforms: z.array(ContentPlatformSchema),
  status: ContentPlanStatusSchema,
  generatedBy: ContentPlanGeneratedBySchema,
  /** Versión del PersonalDNA con la que se generó (null si es manual). */
  personalDnaVersion: z.number().int().min(1).nullable(),
  generation: ContentPlanGenerationSchema.nullable(),
  itemCounts: ContentPlanItemCountsSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

export const ContentPlanItemSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  contentPlanId: ObjectIdSchema,
  /** Proyecto real del workspace en el que se basa la propuesta (si aplica). */
  projectId: ObjectIdSchema.nullable(),
  title: z.string(),
  concept: z.string().nullable(),
  /** "¿Por qué Pixel recomienda esto?" */
  rationale: z.string().nullable(),
  objective: z.string().nullable(),
  audience: z.array(z.string()),
  platform: ContentPlatformSchema.nullable(),
  format: ContentFormatSchema.nullable(),
  pillar: z.string().nullable(),
  angle: ContentAngleSchema.nullable(),
  hook: z.string().nullable(),
  suggestedAngle: z.string().nullable(),
  scheduledFor: IsoDateSchema.nullable(),
  status: ContentPlanItemStatusSchema,
  rejectionReason: z.string().nullable(),
  convertedContentItemId: ObjectIdSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;

/* ---------- Peticiones ---------- */

/**
 * POST …/content-plans/generate. Solo las fechas son obligatorias. `frequency` = piezas por
 * semana. `platforms` restringe el plan; sin ellas se usan las del PersonalDNA. `tzOffset`
 * (Date#getTimezoneOffset del navegador) sitúa cada fecha sugerida en el día local.
 */
export const GenerateContentPlanSchema = periodRefinement(
  z
    .object({
      startDate: DayStringSchema,
      endDate: DayStringSchema,
      frequency: z
        .number()
        .int()
        .min(1, 'Mínimo 1 por semana')
        .max(CONTENT_PLAN_MAX_FREQUENCY, `Máximo ${CONTENT_PLAN_MAX_FREQUENCY} por semana`)
        .optional(),
      platforms: z.array(ContentPlatformSchema).max(9).optional(),
      goal: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
      name: z.string().trim().min(1).max(120).optional(),
      /** Regenerar: crea un plan NUEVO evitando repetir las propuestas de este. */
      regenerateFrom: ObjectIdSchema.optional(),
      tzOffset: z.number().int().min(-840).max(840).default(0),
    })
    .strict(),
);
export type GenerateContentPlanInput = z.input<typeof GenerateContentPlanSchema>;
export type GenerateContentPlanData = z.output<typeof GenerateContentPlanSchema>;

/** POST …/content-plans: plan manual vacío (sin Pixel). */
export const CreateContentPlanSchema = periodRefinement(
  z
    .object({
      name: operationTitle('un nombre', 120),
      objective: operationText(500).default(null),
      startDate: DayStringSchema,
      endDate: DayStringSchema,
      platforms: z.array(ContentPlatformSchema).max(9).default([]),
    })
    .strict(),
);
export type CreateContentPlanInput = z.input<typeof CreateContentPlanSchema>;
export type CreateContentPlanData = z.output<typeof CreateContentPlanSchema>;

/** PATCH …/content-plans/:planId. El periodo y lo generado por Pixel no se editan. */
export const UpdateContentPlanSchema = z
  .object({
    name: operationTitle('un nombre', 120),
    objective: operationText(500),
    status: ContentPlanStatusSchema,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateContentPlanInput = z.input<typeof UpdateContentPlanSchema>;

/**
 * PATCH …/items/:itemId: editar una propuesta ANTES de aceptarla. `status: 'proposed'` recupera
 * una propuesta rechazada. Una propuesta convertida ya no se edita (se edita su ContentItem).
 */
export const UpdateContentPlanItemSchema = z
  .object({
    title: operationTitle('un título'),
    concept: operationText(2000),
    hook: operationText(500),
    platform: ContentPlatformSchema.nullable(),
    format: ContentFormatSchema.nullable(),
    scheduledFor: IsoDateSchema.nullable(),
    status: z.literal('proposed'),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateContentPlanItemInput = z.input<typeof UpdateContentPlanItemSchema>;

/** POST …/items/:itemId/reject. El motivo es opcional (útil para la memoria creativa futura). */
export const RejectContentPlanItemSchema = z
  .object({ reason: operationText(300).optional() })
  .strict();
export type RejectContentPlanItemInput = z.input<typeof RejectContentPlanItemSchema>;

export const ContentPlanListQuerySchema = z.object({
  status: queryEnumList(ContentPlanStatusSchema),
  limit: queryLimit,
  offset: queryOffset,
});

/* ---------- Respuestas ---------- */

export const ContentPlanResponseSchema = z.object({
  plan: ContentPlanSchema,
  items: z.array(ContentPlanItemSchema),
});
export type ContentPlanResponse = z.infer<typeof ContentPlanResponseSchema>;

export const ContentPlanListResponseSchema = z.object({
  plans: z.array(ContentPlanSchema),
  total: z.number().int().min(0),
});
export type ContentPlanListResponse = z.infer<typeof ContentPlanListResponseSchema>;

export const ContentPlanItemResponseSchema = z.object({ item: ContentPlanItemSchema });
export type ContentPlanItemResponse = z.infer<typeof ContentPlanItemResponseSchema>;

/** Aceptar: la propuesta (converted) y su ContentItem (null si el usuario ya lo borró). */
export const AcceptContentPlanItemResponseSchema = z.object({
  item: ContentPlanItemSchema,
  contentItem: ContentItemSchema.nullable(),
  /** false si ya estaba convertida (llamada idempotente: no se creó nada nuevo). */
  created: z.boolean(),
});
export type AcceptContentPlanItemResponse = z.infer<typeof AcceptContentPlanItemResponseSchema>;

/* ---------- Salida estructurada de la IA ---------- */

/**
 * Lo que devuelve el modelo (validado con Zod antes de persistir). Después, el
 * ContentPlanningEngine aplica la validación de fundamento (sin datos inventados), plataformas
 * permitidas, proyectos reales, fechas del periodo y duplicados.
 */
export const GeneratedContentPlanItemSchema = z.object({
  title: z.string().min(3).max(160),
  concept: z.string().min(3).max(1000),
  rationale: z.string().min(3).max(600),
  objective: z.string().min(2).max(200),
  audience: z.array(z.string().max(160)).max(4),
  platform: ContentPlatformSchema,
  format: ContentFormatSchema,
  pillar: z.string().max(80),
  angle: ContentAngleSchema,
  hook: z.string().max(300).nullable(),
  suggestedAngle: z.string().max(300).nullable(),
  /** "YYYY-MM-DD" dentro del periodo. */
  suggestedDate: z.string().nullable(),
  /** Id de uno de los proyectos recibidos, o null si no se basa en un proyecto. */
  projectId: z.string().nullable(),
});
export type GeneratedContentPlanItem = z.infer<typeof GeneratedContentPlanItemSchema>;

export const GeneratedContentPlanSchema = z.object({
  strategySummary: z.string().min(10).max(1200),
  pillars: z
    .array(z.object({ name: z.string().min(2).max(80), rationale: z.string().min(3).max(400) }))
    .min(1)
    .max(6),
  items: z.array(GeneratedContentPlanItemSchema).min(1).max(CONTENT_PLAN_MAX_ITEMS),
});
export type GeneratedContentPlan = z.infer<typeof GeneratedContentPlanSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const CONTENT_PLAN_STATUS_LABELS: Record<ContentPlanStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  completed: 'Completado',
  archived: 'Archivado',
};

export const CONTENT_PLAN_ITEM_STATUS_LABELS: Record<ContentPlanItemStatus, string> = {
  proposed: 'Propuesto',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  converted: 'Convertido',
};

export const CONTENT_ANGLE_LABELS: Record<ContentAngle, string> = {
  education: 'Educación',
  opinion: 'Opinión',
  process: 'Proceso',
  case: 'Caso',
  behind_the_scenes: 'Detrás de cámara',
  reflection: 'Reflexión',
  portfolio: 'Portafolio',
  comparison: 'Comparación',
  storytelling: 'Historia',
};
