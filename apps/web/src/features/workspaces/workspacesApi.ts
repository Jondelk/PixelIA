import {
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  type CreateWorkspaceInput,
  type WorkspaceOverview,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

export async function listWorkspaces(signal?: AbortSignal): Promise<WorkspaceOverview[]> {
  return (await apiRequest('/api/workspaces', WorkspaceListResponseSchema, { signal })).workspaces;
}

export function getWorkspace(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceOverview> {
  return apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}`, WorkspaceResponseSchema, {
    signal,
  });
}

export function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceOverview> {
  return apiRequest('/api/workspaces', WorkspaceResponseSchema, { method: 'POST', body: input });
}
