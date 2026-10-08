import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import {
  OptionalDateInputSchema,
  datesInOrder,
  PrioritySchema,
  operationText,
  operationTitle,
  queryEnum,
  queryEnumList,
  queryLimit,
  queryOffset,
  querySearch,
} from './operations.js';
import type { WorkspaceType } from './workspace.js';

/*
 * Project: reúne tareas y contenido alrededor de un mismo objetivo. Recurso del Workspace
 * (Personal o Enterprise): aislado por workspaceId. El progreso se CALCULA a partir de sus tareas;
 * nunca se guarda ni se acepta del cliente.
 */

/**
 * Clasificación HUMANA del proyecto. La API acepta el enum completo en cualquier workspace; la web
 * ofrece las opciones relevantes de cada tipo (PROJECT_TYPES_BY_WORKSPACE). Solo se añaden valores:
 * los documentos existentes siguen siendo válidos. `campaign` es solo una etiqueta: no implica
 * Campaign Manager.
 */
export const ProjectTypeSchema = z.enum([
  'general',
  'content',
  'client',
  'creative',
  'study',
  'personal',
  'campaign',
  'branding',
  'product_launch',
  'event',
  'internal',
  'other',
]);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

/** Tipos que la web ofrece al crear o editar un proyecto en cada tipo de workspace. */
export const PROJECT_TYPES_BY_WORKSPACE: Record<WorkspaceType, readonly ProjectType[]> = {
  personal: ['general', 'content', 'client', 'creative', 'study', 'personal', 'other'],
  enterprise: [
    'general',
    'content',
    'creative',
    'campaign',
    'branding',
    'product_launch',
    'event',
    'internal',
    'other',
  ],
};

export const ProjectStatusSchema = z.enum([
  'planned',
  'active',
  'on_hold',
  'completed',
  'archived',
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const PROJECT_GOALS_MAX = 10;

/** Conteos derivados de las operaciones hijas (siempre del mismo workspace). */
export const ProjectStatsSchema = z.object({
  /** Tareas que cuentan para el progreso (las canceladas no cuentan). */
  tasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  /** Contenidos del proyecto (sin los archivados). */
  contentItems: z.number().int().min(0),
});
export type ProjectStats = z.infer<typeof ProjectStatsSchema>;

export const ProjectSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  type: ProjectTypeSchema,
  status: ProjectStatusSchema,
  priority: PrioritySchema,
  goals: z.array(z.string()),
  startDate: IsoDateSchema.nullable(),
  dueDate: IsoDateSchema.nullable(),
  /** 0–100: tareas completadas / tareas (sin canceladas). 0 si no hay tareas. Calculado. */
  progress: z.number().int().min(0).max(100),
  stats: ProjectStatsSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectDTO = Project;

const projectGoals = z
  .array(z.string().trim().max(160, 'Cada objetivo admite máximo 160 caracteres'))
  .transform((items) => items.filter(Boolean))
  .pipe(z.array(z.string()).max(PROJECT_GOALS_MAX, `Máximo ${PROJECT_GOALS_MAX} objetivos`));

const projectFields = {
  name: operationTitle('el nombre del proyecto', 120),
  description: operationText(2000),
  type: ProjectTypeSchema,
  status: ProjectStatusSchema,
  priority: PrioritySchema,
  goals: projectGoals,
  startDate: OptionalDateInputSchema,
  dueDate: OptionalDateInputSchema,
};

const projectDatesInOrder = (value: { startDate?: string | null; dueDate?: string | null }) =>
  datesInOrder(value.startDate, value.dueDate);
const DATES_MESSAGE = {
  message: 'La fecha límite no puede ser anterior a la fecha de inicio',
  path: ['dueDate'],
};

/**
 * POST /api/workspaces/:workspaceId/projects. Basta el nombre. `strict`: workspaceId, progress o
 * source en el cuerpo son un 400 (el workspace sale de la URL autorizada).
 */
export const CreateProjectSchema = z
  .object({
    name: projectFields.name,
    description: projectFields.description.default(null),
    type: projectFields.type.default('general'),
    status: projectFields.status.default('active'),
    priority: projectFields.priority.default('medium'),
    goals: projectFields.goals.default([]),
    startDate: projectFields.startDate.default(null),
    dueDate: projectFields.dueDate.default(null),
  })
  .strict()
  .refine(projectDatesInOrder, DATES_MESSAGE);
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;
export type CreateProjectData = z.output<typeof CreateProjectSchema>;

/** PATCH …/projects/:projectId. El orden de fechas se comprueba también contra lo guardado. */
export const UpdateProjectSchema = z
  .object(projectFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar')
  .refine(projectDatesInOrder, DATES_MESSAGE);
export type UpdateProjectInput = z.input<typeof UpdateProjectSchema>;
export type UpdateProjectData = z.output<typeof UpdateProjectSchema>;

/**
 * GET …/projects. Sin `status`, la lista excluye los archivados; `status=archived` los muestra.
 * Orden: actualizados más recientemente primero.
 */
export const ProjectListQuerySchema = z.object({
  status: queryEnumList(ProjectStatusSchema),
  priority: queryEnum(PrioritySchema),
  search: querySearch,
  limit: queryLimit,
  offset: queryOffset,
});
export type ProjectListQuery = z.output<typeof ProjectListQuerySchema>;

export const ProjectResponseSchema = z.object({ project: ProjectSchema });
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
  total: z.number().int().min(0),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planificado',
  active: 'Activo',
  on_hold: 'En pausa',
  completed: 'Completado',
  archived: 'Archivado',
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  general: 'General',
  content: 'Contenido',
  client: 'Cliente',
  creative: 'Creativo',
  study: 'Estudio',
  personal: 'Personal',
  campaign: 'Campaña',
  branding: 'Branding',
  product_launch: 'Lanzamiento',
  event: 'Evento',
  internal: 'Interno',
  other: 'Otro',
};
