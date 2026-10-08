import type {
  CreateProjectData,
  Project,
  ProjectListQuery,
  ProjectListResponse,
  ProjectStats,
  UpdateProjectData,
} from '@pixel/contracts';
import { datesInOrder } from '@pixel/contracts';
import type { QueryFilter, Types } from 'mongoose';
import { notFound } from '../../lib/errors.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { ContentItemModel } from './contentItem.model.js';
import {
  fieldError,
  PROJECT_NOT_FOUND,
  resourceId,
  searchFilter,
  toDate,
} from './operations.scope.js';
import {
  EMPTY_PROJECT_STATS,
  ProjectModel,
  toProjectDTO,
  type ProjectAttrs,
  type ProjectDocument,
} from './project.model.js';
import { TaskModel } from './task.model.js';

/*
 * Projects de un Workspace (Personal o Enterprise). Todas las funciones reciben el workspace ya
 * autorizado y todas las consultas filtran por su workspaceId.
 *
 * Estrategia de borrado: un proyecto con tareas y contenido no se elimina; DELETE lo ARCHIVA
 * (status = archived). Sus operaciones hijas siguen intactas y vinculadas; se puede desarchivar
 * con PATCH. Los archivados no aparecen en la lista salvo que se pidan (status=archived).
 */

const DATES_MESSAGE = 'La fecha límite no puede ser anterior a la fecha de inicio';

/**
 * Conteos de tareas y contenido de varios proyectos en DOS agregaciones (sin N+1). Cada agregación
 * empieza por `$match` del workspace: solo cuenta operaciones del mismo workspace.
 */
export async function projectStatsFor(
  workspace: WorkspaceDocument,
  projectIds: Types.ObjectId[],
): Promise<Map<string, ProjectStats>> {
  const stats = new Map<string, ProjectStats>();
  if (projectIds.length === 0) return stats;
  const [taskGroups, contentGroups] = await Promise.all([
    TaskModel.aggregate<{ _id: Types.ObjectId; tasks: number; completedTasks: number }>([
      {
        $match: {
          workspaceId: workspace._id,
          projectId: { $in: projectIds },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: '$projectId',
          tasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        },
      },
    ]),
    ContentItemModel.aggregate<{ _id: Types.ObjectId; contentItems: number }>([
      {
        $match: {
          workspaceId: workspace._id,
          projectId: { $in: projectIds },
          status: { $ne: 'archived' },
        },
      },
      { $group: { _id: '$projectId', contentItems: { $sum: 1 } } },
    ]),
  ]);
  const entry = (id: Types.ObjectId) => {
    const key = id.toString();
    const current = stats.get(key) ?? { ...EMPTY_PROJECT_STATS };
    stats.set(key, current);
    return current;
  };
  for (const group of taskGroups) {
    Object.assign(entry(group._id), { tasks: group.tasks, completedTasks: group.completedTasks });
  }
  for (const group of contentGroups) entry(group._id).contentItems = group.contentItems;
  return stats;
}

export async function toProjectDTOs(
  workspace: WorkspaceDocument,
  docs: ProjectDocument[],
): Promise<Project[]> {
  const stats = await projectStatsFor(
    workspace,
    docs.map((doc) => doc._id),
  );
  return docs.map((doc) => toProjectDTO(doc, stats.get(doc._id.toString())));
}

async function toOneProjectDTO(workspace: WorkspaceDocument, doc: ProjectDocument) {
  const [project] = await toProjectDTOs(workspace, [doc]);
  return project!;
}

async function findProject(workspace: WorkspaceDocument, rawId: unknown): Promise<ProjectDocument> {
  const project = await ProjectModel.findOne({
    _id: resourceId(rawId, PROJECT_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!project) throw notFound(PROJECT_NOT_FOUND);
  return project;
}

export async function createProject(
  workspace: WorkspaceDocument,
  input: CreateProjectData,
): Promise<Project> {
  const project = await ProjectModel.create({
    ...input,
    startDate: toDate(input.startDate),
    dueDate: toDate(input.dueDate),
    workspaceId: workspace._id,
  });
  return toProjectDTO(project);
}

export async function listProjects(
  workspace: WorkspaceDocument,
  query: ProjectListQuery,
): Promise<ProjectListResponse> {
  const filter: QueryFilter<ProjectAttrs> = {
    workspaceId: workspace._id,
    status: query.status ? { $in: query.status } : { $ne: 'archived' },
    ...(query.priority ? { priority: query.priority } : {}),
    ...searchFilter(['name', 'description'], query.search),
  };
  const [docs, total] = await Promise.all([
    ProjectModel.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(query.offset)
      .limit(query.limit),
    ProjectModel.countDocuments(filter),
  ]);
  return { projects: await toProjectDTOs(workspace, docs), total };
}

export async function getProject(workspace: WorkspaceDocument, rawId: unknown): Promise<Project> {
  return toOneProjectDTO(workspace, await findProject(workspace, rawId));
}

export async function updateProject(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: UpdateProjectData,
): Promise<Project> {
  const project = await findProject(workspace, rawId);
  const startDate = toDate(input.startDate);
  const dueDate = toDate(input.dueDate);
  // El orden de fechas se valida contra lo que quedará guardado, no solo contra el cuerpo.
  const nextStart = startDate === undefined ? project.startDate : startDate;
  const nextDue = dueDate === undefined ? project.dueDate : dueDate;
  if (!datesInOrder(nextStart?.toISOString(), nextDue?.toISOString())) {
    throw fieldError('dueDate', DATES_MESSAGE);
  }
  project.set({
    ...input,
    ...(startDate !== undefined ? { startDate } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
  });
  await project.save();
  return toOneProjectDTO(workspace, project);
}

/** DELETE = archivado controlado (ver cabecera). Idempotente. */
export async function archiveProject(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<Project> {
  const project = await findProject(workspace, rawId);
  if (project.status !== 'archived') {
    project.status = 'archived';
    await project.save();
  }
  return toOneProjectDTO(workspace, project);
}
