import {
  ContentItemListResponseSchema,
  ContentItemResponseSchema,
  type ContentFormat,
  type ContentItem,
  type ContentItemListResponse,
  type ContentPlatform,
  type ContentStatus,
  type CreateContentItemInput,
  type UpdateContentItemInput,
} from '@pixel/contracts';
import { apiRequest, apiSend } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';

/** ContentItems: recursos del workspace bajo /api/workspaces/:workspaceId/content. */

export interface ContentFilters {
  /** Sin estado: todo menos lo archivado. */
  status?: readonly ContentStatus[];
  platform?: ContentPlatform;
  format?: ContentFormat;
  projectId?: string;
  campaignId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const contentPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/content`;
const contentItemPath = (workspaceId: string, contentItemId: string) =>
  `${contentPath(workspaceId)}/${encodeURIComponent(contentItemId)}`;

export function listContent(
  workspaceId: string,
  filters: ContentFilters = {},
  signal?: AbortSignal,
): Promise<ContentItemListResponse> {
  return apiRequest(
    `${contentPath(workspaceId)}${queryString({ ...filters })}`,
    ContentItemListResponseSchema,
    { signal },
  );
}

export async function getContentItem(
  workspaceId: string,
  contentItemId: string,
  signal?: AbortSignal,
): Promise<ContentItem> {
  return (
    await apiRequest(contentItemPath(workspaceId, contentItemId), ContentItemResponseSchema, {
      signal,
    })
  ).contentItem;
}

export async function createContentItem(
  workspaceId: string,
  input: CreateContentItemInput,
): Promise<ContentItem> {
  return (
    await apiRequest(contentPath(workspaceId), ContentItemResponseSchema, {
      method: 'POST',
      body: input,
    })
  ).contentItem;
}

export async function updateContentItem(
  workspaceId: string,
  contentItemId: string,
  input: UpdateContentItemInput,
): Promise<ContentItem> {
  return (
    await apiRequest(contentItemPath(workspaceId, contentItemId), ContentItemResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  ).contentItem;
}

export function deleteContentItem(workspaceId: string, contentItemId: string): Promise<void> {
  return apiSend(contentItemPath(workspaceId, contentItemId), { method: 'DELETE' });
}
