import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { DayStringSchema } from './contentPlan.js';
import { queryLimit, queryOffset } from './operations.js';
import { WorkspaceTypeSchema } from './workspace.js';

/*
 * Daily Director: la dirección del día de un workspace (DailyBrief). Pixel analiza el estado real
 * del trabajo y propone qué merece atención hoy, qué puede esperar y cómo organizar el día. Son
 * RECOMENDACIONES: nunca modifica tareas ni proyectos. Recurso del workspace (reutilizable en
 * Enterprise); hoy solo se genera en un workspace personal. Ver docs/DAILY-DIRECTOR.md.
 */

export const DAILY_MAX_PRIORITIES = 3;
export const DAILY_MAX_FOCUS_BLOCKS = 4;

export const DailyUrgencySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type DailyUrgency = z.infer<typeof DailyUrgencySchema>;

export const DailyResourceTypeSchema = z.enum(['task', 'project', 'content', 'plan_item']);
export type DailyResourceType = z.infer<typeof DailyResourceTypeSchema>;

export const DailyPrioritySchema = z.object({
  rank: z.number().int().min(1).max(DAILY_MAX_PRIORITIES),
  type: z.enum(['task', 'project', 'content']),
  resourceId: ObjectIdSchema.nullable(),
  title: z.string(),
  /** Por qué merece atención hoy (nunca "es importante"). */
  rationale: z.string(),
  suggestedAction: z.string().nullable(),
  /** Calculada por el backend a partir de señales reales (fechas, prioridad, salud del proyecto). */
  urgency: DailyUrgencySchema,
});
export type DailyPriority = z.infer<typeof DailyPrioritySchema>;

export const DailyWarningTypeSchema = z.enum([
  'overdue',
  'deadline',
  'overload',
  'stalled_project',
  'content_gap',
  'conflict',
  'other',
]);
export type DailyWarningType = z.infer<typeof DailyWarningTypeSchema>;

/** Avisos: hechos calculados por el backend (la IA no los inventa ni los oculta). */
export const DailyWarningSchema = z.object({
  type: DailyWarningTypeSchema,
  message: z.string(),
  relatedResourceIds: z.array(ObjectIdSchema),
});
export type DailyWarning = z.infer<typeof DailyWarningSchema>;

export const DailyContentActionSchema = z.enum([
  'develop',
  'record',
  'design',
  'edit',
  'publish',
  'plan',
]);
export type DailyContentAction = z.infer<typeof DailyContentActionSchema>;

/** Preferencia: ContentItem existente → propuesta de un plan → proyecto real. Nunca una idea nueva. */
export const DailyContentSuggestionSchema = z.object({
  contentItemId: ObjectIdSchema.nullable(),
  contentPlanItemId: ObjectIdSchema.nullable(),
  contentPlanId: ObjectIdSchema.nullable(),
  projectId: ObjectIdSchema.nullable(),
  title: z.string(),
  reason: z.string(),
  suggestedAction: DailyContentActionSchema,
});
export type DailyContentSuggestion = z.infer<typeof DailyContentSuggestionSchema>;

/** Bloque de enfoque: un orden, no un horario (sin "09:00–10:00"). */
export const FocusBlockSchema = z.object({
  order: z.number().int().min(1),
  title: z.string(),
  objective: z.string(),
  relatedResourceId: ObjectIdSchema.nullable(),
  relatedResourceType: DailyResourceTypeSchema.nullable(),
  /** Solo si sale de `estimatedMinutes` de las tareas (nunca inventado). */
  suggestedMinutes: z.number().int().min(1).nullable(),
});
export type FocusBlock = z.infer<typeof FocusBlockSchema>;

/** Hechos del momento de la generación (para la UI y el chat). */
export const DailyFactsSchema = z.object({
  openTasks: z.number().int().min(0),
  overdueTasks: z.number().int().min(0),
  dueToday: z.number().int().min(0),
  dueTomorrow: z.number().int().min(0),
  activeProjects: z.number().int().min(0),
  activeContent: z.number().int().min(0),
});
export type DailyFacts = z.infer<typeof DailyFactsSchema>;

export const DailyGenerationModeSchema = z.enum(['ai', 'deterministic']);
export type DailyGenerationMode = z.infer<typeof DailyGenerationModeSchema>;

export const DailyFallbackReasonSchema = z.enum([
  /** Proveedor demo: no hay modelo. */
  'demo',
  /** El proveedor real falló (red, timeout, cuota…). */
  'ai_unavailable',
  /** La IA devolvió referencias desconocidas o una estructura inválida. */
  'invalid_output',
  /** No hay trabajo registrado: no se llama a la IA. */
  'no_work',
]);
export type DailyFallbackReason = z.infer<typeof DailyFallbackReasonSchema>;

export const DailyGenerationSchema = z.object({
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  inputTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
  fallbackReason: DailyFallbackReasonSchema.nullable(),
  /** Textos de la IA sustituidos por la versión determinística (datos no fundamentados). */
  sanitizedFields: z.number().int().min(0),
});
export type DailyGeneration = z.infer<typeof DailyGenerationSchema>;

export const DailyBriefSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  contextType: WorkspaceTypeSchema,
  /** Día local "YYYY-MM-DD" en `timezone`. Un brief vigente por workspace y día. */
  localDate: DayStringSchema,
  timezone: z.string(),
  /** Versión del día (regenerar crea la siguiente; se devuelve siempre la última). */
  version: z.number().int().min(1),
  personalDnaVersion: z.number().int().min(1).nullable(),
  generationMode: DailyGenerationModeSchema,
  summary: z.string(),
  priorities: z.array(DailyPrioritySchema).max(DAILY_MAX_PRIORITIES),
  warnings: z.array(DailyWarningSchema),
  contentSuggestion: DailyContentSuggestionSchema.nullable(),
  focusBlocks: z.array(FocusBlockSchema).max(DAILY_MAX_FOCUS_BLOCKS),
  closingNote: z.string().nullable(),
  facts: DailyFactsSchema,
  generation: DailyGenerationSchema,
  /** Momento en que se leyó el estado del trabajo (base de la detección de cambios). */
  contextSnapshotAt: IsoDateSchema,
  generatedAt: IsoDateSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type DailyBrief = z.infer<typeof DailyBriefSchema>;

/* ---------- Respuestas ---------- */

/** GET …/daily-brief y POST …/daily-brief/generate. `stale`: hubo cambios desde la generación. */
export const DailyBriefResponseSchema = z.object({ brief: DailyBriefSchema, stale: z.boolean() });
export type DailyBriefResponse = z.infer<typeof DailyBriefResponseSchema>;

export const DailyBriefListQuerySchema = z.object({ limit: queryLimit, offset: queryOffset });

export const DailyBriefListResponseSchema = z.object({
  briefs: z.array(DailyBriefSchema),
  total: z.number().int().min(0),
});
export type DailyBriefListResponse = z.infer<typeof DailyBriefListResponseSchema>;

export const DailyBriefByIdResponseSchema = z.object({ brief: DailyBriefSchema });

/* ---------- Salida estructurada de la IA ---------- */

/**
 * Lo que devuelve el modelo. Solo puede REFERENCIAR elementos del contexto mediante referencias
 * controladas (TASK_1, PROJECT_2, CONTENT_1, PLANITEM_1): nunca ids reales ni elementos nuevos.
 * Títulos, urgencias, minutos y avisos los pone el backend.
 */
export const DailyBriefGenerationSchema = z.object({
  summary: z.string().min(10).max(600),
  priorities: z
    .array(
      z.object({
        ref: z.string().max(20),
        rationale: z.string().min(10).max(400),
        suggestedAction: z.string().max(200).nullable(),
      }),
    )
    .max(DAILY_MAX_PRIORITIES),
  contentSuggestion: z
    .object({
      ref: z.string().max(20),
      reason: z.string().min(10).max(400),
      suggestedAction: DailyContentActionSchema,
    })
    .nullable(),
  focusBlocks: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        objective: z.string().min(3).max(240),
        ref: z.string().max(20).nullable(),
      }),
    )
    .max(DAILY_MAX_FOCUS_BLOCKS),
  closingNote: z.string().max(300).nullable(),
});
export type DailyBriefGeneration = z.infer<typeof DailyBriefGenerationSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const DAILY_URGENCY_LABELS: Record<DailyUrgency, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const DAILY_CONTENT_ACTION_LABELS: Record<DailyContentAction, string> = {
  develop: 'Desarrollar',
  record: 'Grabar',
  design: 'Diseñar',
  edit: 'Editar',
  publish: 'Publicar',
  plan: 'Planificar',
};
