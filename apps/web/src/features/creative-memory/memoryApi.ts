import {
  CreativeMemoryActionResponseSchema,
  CreativeMemoryListResponseSchema,
  CreativeMemoryResponseSchema,
  type CreativeMemory,
  type CreativeMemoryListQuery,
  type CreativeMemoryResponse,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';

/** Creative Memory: /api/workspaces/:workspaceId/creative-memories (Personal y Enterprise). */

const memoriesPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/creative-memories`;
const memoryPath = (workspaceId: string, memoryId: string) =>
  `${memoriesPath(workspaceId)}/${encodeURIComponent(memoryId)}`;

export async function listMemories(
  workspaceId: string,
  view: CreativeMemoryListQuery['view'] = 'all',
  signal?: AbortSignal,
): Promise<CreativeMemory[]> {
  const { memories } = await apiRequest(
    `${memoriesPath(workspaceId)}?view=${view}`,
    CreativeMemoryListResponseSchema,
    { signal },
  );
  return memories;
}

/** Detalle con la evidencia humana ("¿Por qué Pixel piensa esto?"). */
export function getMemory(
  workspaceId: string,
  memoryId: string,
  signal?: AbortSignal,
): Promise<CreativeMemoryResponse> {
  return apiRequest(memoryPath(workspaceId, memoryId), CreativeMemoryResponseSchema, { signal });
}

async function memoryAction(workspaceId: string, memoryId: string, action: string, body?: object) {
  const { memory } = await apiRequest(
    `${memoryPath(workspaceId, memoryId)}/${action}`,
    CreativeMemoryActionResponseSchema,
    { method: 'POST', ...(body ? { body } : {}) },
  );
  return memory;
}

export const confirmMemory = (workspaceId: string, memoryId: string) =>
  memoryAction(workspaceId, memoryId, 'confirm');
export const dismissMemory = (workspaceId: string, memoryId: string) =>
  memoryAction(workspaceId, memoryId, 'dismiss');
export const forgetMemory = (workspaceId: string, memoryId: string) =>
  memoryAction(workspaceId, memoryId, 'forget');
/** Editar = nueva memoria; la anterior pasa al historial. */
export const replaceMemory = (workspaceId: string, memoryId: string, text: string) =>
  memoryAction(workspaceId, memoryId, 'replace', { text });
