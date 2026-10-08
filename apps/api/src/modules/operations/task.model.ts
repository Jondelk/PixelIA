import {
  OperationSourceSchema,
  PrioritySchema,
  TaskSchema,
  TaskStatusSchema,
  type OperationSource,
  type Priority,
  type Task,
  type TaskStatus,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * Task: recurso operacional del Workspace. `projectId` (opcional) apunta siempre a un Project del
 * mismo workspace: lo verifica el servicio antes de guardar. Toda consulta filtra por workspaceId.
 */
export interface TaskAttrs {
  workspaceId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date | null;
  estimatedMinutes: number | null;
  tags: string[];
  source: OperationSource;
  /** Lo fija el servidor al pasar a `done` y lo limpia al salir de `done`. */
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<TaskAttrs>;

const taskSchema = new Schema<TaskAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, default: null, maxlength: 4000 },
    status: { type: String, enum: TaskStatusSchema.options, required: true, default: 'inbox' },
    priority: { type: String, enum: PrioritySchema.options, required: true, default: 'medium' },
    dueDate: { type: Date, default: null },
    estimatedMinutes: { type: Number, default: null, min: 1 },
    tags: { type: [String], default: [] },
    source: {
      type: String,
      enum: OperationSourceSchema.options,
      required: true,
      default: 'manual',
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo de los compuestos.
taskSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
taskSchema.index({ workspaceId: 1, dueDate: 1 });
taskSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
taskSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const TaskModel = model<TaskAttrs>('Task', taskSchema, 'tasks');

export function toTaskDTO(doc: TaskDocument): Task {
  return TaskSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    projectId: doc.projectId?.toString() ?? null,
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate?.toISOString() ?? null,
    estimatedMinutes: doc.estimatedMinutes ?? null,
    tags: [...doc.tags],
    source: doc.source,
    completedAt: doc.completedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
