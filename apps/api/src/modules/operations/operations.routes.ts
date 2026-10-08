import {
  ContentItemListQuerySchema,
  CreateContentItemSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  OperationsSummaryQuerySchema,
  ProjectListQuerySchema,
  TaskListQuerySchema,
  UpdateContentItemSchema,
  UpdateProjectSchema,
  UpdateTaskSchema,
  type ContentItemListResponse,
  type ContentItemResponse,
  type OperationsSummaryResponse,
  type ProjectListResponse,
  type ProjectResponse,
  type TaskListResponse,
  type TaskResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  createContentItem,
  deleteContentItem,
  getContentItem,
  listContentItems,
  updateContentItem,
} from './content.service.js';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from './projects.service.js';
import { getOperationsSummary } from './summary.service.js';
import { createTask, deleteTask, getTask, listTasks, updateTask } from './tasks.service.js';

/**
 * Módulo operations — montado en /api/workspaces/:workspaceId detrás de requireWorkspaceAccess:
 * `req.workspace` es un workspace (Personal o Enterprise) del usuario de la sesión. Nunca se lee
 * un workspaceId del cuerpo: los schemas son `strict` y lo rechazan.
 */

/** /projects. DELETE archiva (no elimina): ver projects.service.ts. */
export const projectsRouter: Router = Router({ mergeParams: true });

projectsRouter.post('/', async (req, res) => {
  const input = CreateProjectSchema.parse(req.body);
  const body: ProjectResponse = { project: await createProject(getWorkspace(req), input) };
  res.status(201).json(body);
});

projectsRouter.get('/', async (req, res) => {
  const query = ProjectListQuerySchema.parse(req.query);
  const body: ProjectListResponse = await listProjects(getWorkspace(req), query);
  res.json(body);
});

projectsRouter.get('/:projectId', async (req, res) => {
  const body: ProjectResponse = {
    project: await getProject(getWorkspace(req), req.params.projectId),
  };
  res.json(body);
});

projectsRouter.patch('/:projectId', async (req, res) => {
  const input = UpdateProjectSchema.parse(req.body);
  const body: ProjectResponse = {
    project: await updateProject(getWorkspace(req), req.params.projectId, input),
  };
  res.json(body);
});

projectsRouter.delete('/:projectId', async (req, res) => {
  const body: ProjectResponse = {
    project: await archiveProject(getWorkspace(req), req.params.projectId),
  };
  res.json(body);
});

/** /tasks */
export const tasksRouter: Router = Router({ mergeParams: true });

tasksRouter.post('/', async (req, res) => {
  const input = CreateTaskSchema.parse(req.body);
  const body: TaskResponse = { task: await createTask(getWorkspace(req), input) };
  res.status(201).json(body);
});

tasksRouter.get('/', async (req, res) => {
  const query = TaskListQuerySchema.parse(req.query);
  const body: TaskListResponse = await listTasks(getWorkspace(req), query);
  res.json(body);
});

tasksRouter.get('/:taskId', async (req, res) => {
  const body: TaskResponse = { task: await getTask(getWorkspace(req), req.params.taskId) };
  res.json(body);
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const input = UpdateTaskSchema.parse(req.body);
  const body: TaskResponse = {
    task: await updateTask(getWorkspace(req), req.params.taskId, input),
  };
  res.json(body);
});

tasksRouter.delete('/:taskId', async (req, res) => {
  await deleteTask(getWorkspace(req), req.params.taskId);
  res.status(204).end();
});

/** /content */
export const contentRouter: Router = Router({ mergeParams: true });

contentRouter.post('/', async (req, res) => {
  const input = CreateContentItemSchema.parse(req.body);
  const body: ContentItemResponse = {
    contentItem: await createContentItem(getWorkspace(req), input),
  };
  res.status(201).json(body);
});

contentRouter.get('/', async (req, res) => {
  const query = ContentItemListQuerySchema.parse(req.query);
  const body: ContentItemListResponse = await listContentItems(getWorkspace(req), query);
  res.json(body);
});

contentRouter.get('/:contentItemId', async (req, res) => {
  const body: ContentItemResponse = {
    contentItem: await getContentItem(getWorkspace(req), req.params.contentItemId),
  };
  res.json(body);
});

contentRouter.patch('/:contentItemId', async (req, res) => {
  const input = UpdateContentItemSchema.parse(req.body);
  const body: ContentItemResponse = {
    contentItem: await updateContentItem(getWorkspace(req), req.params.contentItemId, input),
  };
  res.json(body);
});

contentRouter.delete('/:contentItemId', async (req, res) => {
  await deleteContentItem(getWorkspace(req), req.params.contentItemId);
  res.status(204).end();
});

/** /operations/summary: conteos y listas cortas para el Inicio. */
export const operationsRouter: Router = Router({ mergeParams: true });

operationsRouter.get('/summary', async (req, res) => {
  const { tzOffset } = OperationsSummaryQuerySchema.parse(req.query);
  const body: OperationsSummaryResponse = {
    summary: await getOperationsSummary(getWorkspace(req), { tzOffset }),
  };
  res.json(body);
});
