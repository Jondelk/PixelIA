import {
  ProjectListResponseSchema,
  ProjectResponseSchema,
  type CreateProjectInput,
  type Priority,
  type Project,
  type ProjectListResponse,
  type ProjectStatus,
  type UpdateProjectInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';

/** Projects: recursos del workspace bajo /api/workspaces/:workspaceId/projects. */

export interface ProjectFilters {
  /** Sin estado: todos menos los archivados. */
  status?: readonly ProjectStatus[];
  priority?: Priority;
  search?: string;
  limit?: number;
  offset?: number;
}

const projectsPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/projects`;
const projectPath = (workspaceId: string, projectId: string) =>
  `${projectsPath(workspaceId)}/${encodeURIComponent(projectId)}`;

export function listProjects(
  workspaceId: string,
  filters: ProjectFilters = {},
  signal?: AbortSignal,
): Promise<ProjectListResponse> {
  return apiRequest(
    `${projectsPath(workspaceId)}${queryString({ ...filters })}`,
    ProjectListResponseSchema,
    { signal },
  );
}

export async function getProject(
  workspaceId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<Project> {
  return (await apiRequest(projectPath(workspaceId, projectId), ProjectResponseSchema, { signal }))
    .project;
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
): Promise<Project> {
  return (
    await apiRequest(projectsPath(workspaceId), ProjectResponseSchema, {
      method: 'POST',
      body: input,
    })
  ).project;
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project> {
  return (
    await apiRequest(projectPath(workspaceId, projectId), ProjectResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  ).project;
}

/** DELETE archiva el proyecto (sus tareas y contenido se conservan). */
export async function archiveProject(workspaceId: string, projectId: string): Promise<Project> {
  return (
    await apiRequest(projectPath(workspaceId, projectId), ProjectResponseSchema, {
      method: 'DELETE',
    })
  ).project;
}
