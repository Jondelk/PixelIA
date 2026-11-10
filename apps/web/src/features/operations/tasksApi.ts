import {
  TaskListResponseSchema,
  TaskResponseSchema,
  type CreateTaskInput,
  type Priority,
  type Task,
  type TaskDueFilter,
  type TaskListResponse,
  type TaskStatus,
  type UpdateTaskInput,
} from '@pixel/contracts';
import { apiRequest, apiSend } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { browserTzOffset, queryString } from '../../lib/query';

/** Tasks: recursos del workspace bajo /api/workspaces/:workspaceId/tasks. */

export interface TaskFilters {
  status?: readonly TaskStatus[];
  priority?: Priority;
  projectId?: string;
  /** Relativo al día local del navegador (se envía su zona horaria). */
  due?: TaskDueFilter;
  search?: string;
  limit?: number;
  offset?: number;
}

const tasksPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/tasks`;
const taskPath = (workspaceId: string, taskId: string) =>
  `${tasksPath(workspaceId)}/${encodeURIComponent(taskId)}`;

export function listTasks(
  workspaceId: string,
  filters: TaskFilters = {},
  signal?: AbortSignal,
): Promise<TaskListResponse> {
  const tzOffset = filters.due ? browserTzOffset() : undefined;
  return apiRequest(
    `${tasksPath(workspaceId)}${queryString({ ...filters, tzOffset })}`,
    TaskListResponseSchema,
    { signal },
  );
}

export async function getTask(
  workspaceId: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<Task> {
  return (await apiRequest(taskPath(workspaceId, taskId), TaskResponseSchema, { signal })).task;
}

export async function createTask(workspaceId: string, input: CreateTaskInput): Promise<Task> {
  return (
    await apiRequest(tasksPath(workspaceId), TaskResponseSchema, { method: 'POST', body: input })
  ).task;
}

export async function updateTask(
  workspaceId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  return (
    await apiRequest(taskPath(workspaceId, taskId), TaskResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  ).task;
}

/** Completar: la API fija `completedAt`. */
export function completeTask(workspaceId: string, taskId: string): Promise<Task> {
  return updateTask(workspaceId, taskId, { status: 'done' });
}

/** Reabrir: vuelve a "Por hacer" y la API limpia `completedAt`. */
export function reopenTask(workspaceId: string, taskId: string): Promise<Task> {
  return updateTask(workspaceId, taskId, { status: 'todo' });
}

export function deleteTask(workspaceId: string, taskId: string): Promise<void> {
  return apiSend(taskPath(workspaceId, taskId), { method: 'DELETE' });
}
