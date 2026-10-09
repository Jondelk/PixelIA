import {
  PrioritySchema,
  ProjectSchema,
  ProjectStatusSchema,
  ProjectTypeSchema,
  type Priority,
  type Project,
  type ProjectStats,
  type ProjectStatus,
  type ProjectType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * Project: recurso operacional del Workspace (Personal o Enterprise). Toda consulta filtra por
 * workspaceId (tenantScoped). El progreso no se guarda: se calcula de sus tareas al responder.
 */
export interface ProjectAttrs {
  workspaceId: Types.ObjectId;
  /** Campaña del mismo workspace que lo origina (opcional; solo Enterprise). */
  campaignId: Types.ObjectId | null;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  goals: string[];
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<ProjectAttrs>;

const projectSchema = new Schema<ProjectAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, default: null, maxlength: 2000 },
    type: { type: String, enum: ProjectTypeSchema.options, required: true, default: 'general' },
    status: { type: String, enum: ProjectStatusSchema.options, required: true, default: 'active' },
    priority: { type: String, enum: PrioritySchema.options, required: true, default: 'medium' },
    goals: { type: [String], default: [] },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo de los compuestos.
projectSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, dueDate: 1 });
projectSchema.index({ workspaceId: 1, campaignId: 1 });
projectSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const ProjectModel = model<ProjectAttrs>('Project', projectSchema, 'projects');

export const EMPTY_PROJECT_STATS: ProjectStats = { tasks: 0, completedTasks: 0, contentItems: 0 };

/** Progreso 0–100 derivado de las tareas (0 si no hay ninguna). */
export function projectProgress(stats: ProjectStats): number {
  return stats.tasks === 0 ? 0 : Math.round((stats.completedTasks / stats.tasks) * 100);
}

export function toProjectDTO(
  doc: ProjectDocument,
  stats: ProjectStats = EMPTY_PROJECT_STATS,
): Project {
  return ProjectSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    campaignId: doc.campaignId?.toString() ?? null,
    name: doc.name,
    description: doc.description ?? null,
    type: doc.type,
    status: doc.status,
    priority: doc.priority,
    goals: [...doc.goals],
    startDate: doc.startDate?.toISOString() ?? null,
    dueDate: doc.dueDate?.toISOString() ?? null,
    progress: projectProgress(stats),
    stats,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
