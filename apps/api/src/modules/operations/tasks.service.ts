import type {
  CreateTaskData,
  OperationSource,
  Task,
  TaskListQuery,
  TaskListResponse,
  TaskStatus,
  UpdateTaskData,
} from '@pixel/contracts';
import type { QueryFilter, SortOrder } from 'mongoose';
import { notFound } from '../../lib/errors.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  assertProjectInWorkspace,
  localDayBounds,
  resourceId,
  toDate,
  searchFilter,
  TASK_NOT_FOUND,
} from './operations.scope.js';
import { TaskModel, toTaskDTO, type TaskAttrs, type TaskDocument } from './task.model.js';

/*
 * Tasks de un Workspace. Reglas (docs/OPERATIONS.md):
 * - pueden existir sin proyecto; si tienen uno, es del MISMO workspace (se verifica al guardar);
 * - `completedAt` = momento en que pasa a `done`; se limpia al salir de `done`;
 * - `source` lo decide el servidor (`manual` desde la API; `pixel` queda para servicios internos);
 * - DELETE elimina la tarea (recurso hoja, sin hijos). Para conservarla, `status = cancelled`.
 */

function completedAtFor(
  status: TaskStatus,
  previous: { status: TaskStatus; completedAt: Date | null } | null,
  now: Date,
): Date | null {
  if (status !== 'done') return null;
  return previous?.status === 'done' ? (previous.completedAt ?? now) : now;
}

async function findTask(workspace: WorkspaceDocument, rawId: unknown): Promise<TaskDocument> {
  const task = await TaskModel.findOne({
    _id: resourceId(rawId, TASK_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!task) throw notFound(TASK_NOT_FOUND);
  return task;
}

export async function createTask(
  workspace: WorkspaceDocument,
  input: CreateTaskData,
  options: { source?: OperationSource; now?: Date } = {},
): Promise<Task> {
  const now = options.now ?? new Date();
  const projectId = input.projectId
    ? await assertProjectInWorkspace(workspace, input.projectId)
    : null;
  const task = await TaskModel.create({
    ...input,
    workspaceId: workspace._id,
    projectId,
    dueDate: toDate(input.dueDate),
    source: options.source ?? 'manual',
    completedAt: completedAtFor(input.status, null, now),
  });
  return toTaskDTO(task);
}

function dueFilter(query: TaskListQuery, now: Date) {
  if (!query.due) return {};
  const { start, end } = localDayBounds(now, query.tzOffset);
  if (query.due === 'today') return { dueDate: { $gte: start, $lt: end } };
  if (query.due === 'overdue') return { dueDate: { $lt: start } };
  return { dueDate: { $gte: end } };
}

function sortFor(query: TaskListQuery): Record<string, SortOrder> {
  if (query.due) return { dueDate: 1, _id: 1 };
  if (query.status?.length === 1 && query.status[0] === 'done') return { completedAt: -1, _id: -1 };
  return { createdAt: -1, _id: -1 };
}

export async function listTasks(
  workspace: WorkspaceDocument,
  query: TaskListQuery,
  now = new Date(),
): Promise<TaskListResponse> {
  const filter: QueryFilter<TaskAttrs> = {
    workspaceId: workspace._id,
    ...(query.status ? { status: { $in: query.status } } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...dueFilter(query, now),
    ...searchFilter(['title', 'description'], query.search),
  };
  const [docs, total] = await Promise.all([
    TaskModel.find(filter).sort(sortFor(query)).skip(query.offset).limit(query.limit),
    TaskModel.countDocuments(filter),
  ]);
  return { tasks: docs.map(toTaskDTO), total };
}

export async function getTask(workspace: WorkspaceDocument, rawId: unknown): Promise<Task> {
  return toTaskDTO(await findTask(workspace, rawId));
}

export async function updateTask(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: UpdateTaskData,
  now = new Date(),
): Promise<Task> {
  const task = await findTask(workspace, rawId);
  const { projectId, dueDate, status, ...rest } = input;
  task.set(rest);
  if (projectId !== undefined) {
    task.projectId = projectId ? await assertProjectInWorkspace(workspace, projectId) : null;
  }
  if (dueDate !== undefined) task.dueDate = toDate(dueDate) ?? null;
  if (status !== undefined) {
    task.completedAt = completedAtFor(status, task, now);
    task.status = status;
  }
  await task.save();
  return toTaskDTO(task);
}

export async function deleteTask(workspace: WorkspaceDocument, rawId: unknown): Promise<void> {
  const { deletedCount } = await TaskModel.deleteOne({
    _id: resourceId(rawId, TASK_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (deletedCount === 0) throw notFound(TASK_NOT_FOUND);
}
