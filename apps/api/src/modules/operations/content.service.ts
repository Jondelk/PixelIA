import type {
  ContentItem,
  ContentItemListQuery,
  ContentItemListResponse,
  ContentStatus,
  CreateContentItemData,
  OperationSource,
  UpdateContentItemData,
} from '@pixel/contracts';
import type { QueryFilter, Types } from 'mongoose';
import { notFound } from '../../lib/errors.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  ContentItemModel,
  toContentItemDTO,
  type ContentItemAttrs,
  type ContentItemDocument,
} from './contentItem.model.js';
import {
  assertProjectInWorkspace,
  CONTENT_NOT_FOUND,
  resourceId,
  toDate,
  searchFilter,
} from './operations.scope.js';

/*
 * ContentItems de un Workspace: piezas en proceso, no posts reales (no hay integración con redes).
 * Reglas (docs/OPERATIONS.md):
 * - si tienen proyecto, es del MISMO workspace;
 * - `publishedAt`: al pasar a `published` se usa el enviado o, si no hay, el actual o "ahora";
 *   al volver a una etapa anterior (idea…ready) se limpia; al archivar se conserva;
 * - `source` lo decide el servidor;
 * - DELETE elimina la pieza (recurso hoja). Para conservarla, `status = archived`.
 */

function publishedAtFor(
  status: ContentStatus,
  requested: Date | null | undefined,
  current: Date | null,
  now: Date,
): Date | null {
  if (status === 'published') return requested ?? current ?? now;
  if (status === 'archived') return requested === undefined ? current : requested;
  return null;
}

async function findContentItem(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<ContentItemDocument> {
  const item = await ContentItemModel.findOne({
    _id: resourceId(rawId, CONTENT_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!item) throw notFound(CONTENT_NOT_FOUND);
  return item;
}

export async function createContentItem(
  workspace: WorkspaceDocument,
  input: CreateContentItemData,
  /** `id`: id ya reservado (conversión atómica desde una propuesta del Content Planner). */
  options: { source?: OperationSource; now?: Date; id?: Types.ObjectId } = {},
): Promise<ContentItem> {
  const now = options.now ?? new Date();
  const projectId = input.projectId
    ? await assertProjectInWorkspace(workspace, input.projectId)
    : null;
  const item = await ContentItemModel.create({
    ...(options.id ? { _id: options.id } : {}),
    ...input,
    workspaceId: workspace._id,
    projectId,
    scheduledFor: toDate(input.scheduledFor),
    publishedAt: publishedAtFor(input.status, toDate(input.publishedAt), null, now),
    source: options.source ?? 'manual',
  });
  return toContentItemDTO(item);
}

export async function listContentItems(
  workspace: WorkspaceDocument,
  query: ContentItemListQuery,
): Promise<ContentItemListResponse> {
  const filter: QueryFilter<ContentItemAttrs> = {
    workspaceId: workspace._id,
    status: query.status ? { $in: query.status } : { $ne: 'archived' },
    ...(query.platform ? { platform: query.platform } : {}),
    ...(query.format ? { format: query.format } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...searchFilter(['title', 'concept', 'hook'], query.search),
  };
  const [docs, total] = await Promise.all([
    ContentItemModel.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(query.offset)
      .limit(query.limit),
    ContentItemModel.countDocuments(filter),
  ]);
  return { contentItems: docs.map(toContentItemDTO), total };
}

export async function getContentItem(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<ContentItem> {
  return toContentItemDTO(await findContentItem(workspace, rawId));
}

export async function updateContentItem(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: UpdateContentItemData,
  now = new Date(),
): Promise<ContentItem> {
  const item = await findContentItem(workspace, rawId);
  const { projectId, scheduledFor, publishedAt, status, ...rest } = input;
  item.set(rest);
  if (projectId !== undefined) {
    item.projectId = projectId ? await assertProjectInWorkspace(workspace, projectId) : null;
  }
  if (scheduledFor !== undefined) item.scheduledFor = toDate(scheduledFor) ?? null;
  const nextStatus = status ?? item.status;
  item.publishedAt = publishedAtFor(nextStatus, toDate(publishedAt), item.publishedAt, now);
  item.status = nextStatus;
  await item.save();
  return toContentItemDTO(item);
}

export async function deleteContentItem(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<void> {
  const { deletedCount } = await ContentItemModel.deleteOne({
    _id: resourceId(rawId, CONTENT_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (deletedCount === 0) throw notFound(CONTENT_NOT_FOUND);
}
