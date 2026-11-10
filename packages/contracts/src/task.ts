import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import {
  OperationSourceSchema,
  OptionalDateInputSchema,
  PrioritySchema,
  operationText,
  operationTitle,
  queryEnum,
  queryEnumList,
  queryLimit,
  queryOffset,
  querySearch,
  queryTzOffset,
  tagList,
} from './operations.js';

/*
 * Task: una acción concreta. Recurso del Workspace; puede pertenecer a un Project del MISMO
 * workspace o a ninguno. `completedAt` lo gestiona el servidor: se fija al pasar a `done` y se
 * limpia al salir de `done`.
 */

export const TaskStatusSchema = z.enum(['inbox', 'todo', 'doing', 'done', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Estados de una tarea pendiente (ni hecha ni cancelada). */
export const OPEN_TASK_STATUSES = ['inbox', 'todo', 'doing'] as const satisfies TaskStatus[];

export const TASK_ESTIMATE_MAX_MINUTES = 60 * 24 * 7;

export const TaskSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  projectId: ObjectIdSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  dueDate: IsoDateSchema.nullable(),
  estimatedMinutes: z.number().int().min(1).nullable(),
  tags: z.array(z.string()),
  source: OperationSourceSchema,
  completedAt: IsoDateSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Task = z.infer<typeof TaskSchema>;
export type TaskDTO = Task;

const taskFields = {
  title: operationTitle('qué necesitas hacer'),
  description: operationText(4000),
  /** Proyecto del mismo workspace; null = sin proyecto. El servidor verifica que sea del workspace. */
  projectId: ObjectIdSchema.nullable(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  dueDate: OptionalDateInputSchema,
  estimatedMinutes: z
    .number()
    .int('Usa minutos enteros')
    .min(1, 'Mínimo 1 minuto')
    .max(TASK_ESTIMATE_MAX_MINUTES, 'Máximo una semana')
    .nullable(),
  tags: tagList(),
};

/**
 * POST /api/workspaces/:workspaceId/tasks. Basta el título (Quick Task). `strict`: workspaceId,
 * source o completedAt en el cuerpo son un 400.
 */
export const CreateTaskSchema = z
  .object({
    title: taskFields.title,
    description: taskFields.description.default(null),
    projectId: taskFields.projectId.default(null),
    status: taskFields.status.default('inbox'),
    priority: taskFields.priority.default('medium'),
    dueDate: taskFields.dueDate.default(null),
    estimatedMinutes: taskFields.estimatedMinutes.default(null),
    tags: taskFields.tags.default([]),
  })
  .strict();
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type CreateTaskData = z.output<typeof CreateTaskSchema>;

/** PATCH …/tasks/:taskId. Completar = `{ status: 'done' }`; reabrir = `{ status: 'todo' }`. */
export const UpdateTaskSchema = z
  .object(taskFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateTaskInput = z.input<typeof UpdateTaskSchema>;
export type UpdateTaskData = z.output<typeof UpdateTaskSchema>;

/**
 * Filtro por fecha límite, relativo al día local del usuario (`tzOffset`):
 * - today: vence hoy · overdue: venció antes de hoy · upcoming: vence de mañana en adelante.
 * Solo filtra por fecha: el estado se filtra aparte (p. ej. `status=inbox,todo,doing`).
 */
export const TaskDueFilterSchema = z.enum(['today', 'overdue', 'upcoming']);
export type TaskDueFilter = z.infer<typeof TaskDueFilterSchema>;

/**
 * GET …/tasks. Orden: con `due`, por fecha límite ascendente; con `status=done`, por fecha de
 * completado descendente; si no, las creadas más recientemente primero.
 */
export const TaskListQuerySchema = z.object({
  status: queryEnumList(TaskStatusSchema),
  priority: queryEnum(PrioritySchema),
  projectId: ObjectIdSchema.optional(),
  due: queryEnum(TaskDueFilterSchema),
  tzOffset: queryTzOffset,
  search: querySearch,
  limit: queryLimit,
  offset: queryOffset,
});
export type TaskListQuery = z.output<typeof TaskListQuerySchema>;

export const TaskResponseSchema = z.object({ task: TaskSchema });
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.object({
  tasks: z.array(TaskSchema),
  total: z.number().int().min(0),
});
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  todo: 'Por hacer',
  doing: 'En curso',
  done: 'Hecha',
  cancelled: 'Cancelada',
};
