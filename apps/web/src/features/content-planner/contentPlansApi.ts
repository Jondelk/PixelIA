import {
  AcceptContentPlanItemResponseSchema,
  ContentPlanItemResponseSchema,
  ContentPlanListResponseSchema,
  ContentPlanResponseSchema,
  type AcceptContentPlanItemResponse,
  type ContentPlanItem,
  type ContentPlanListResponse,
  type ContentPlanResponse,
  type ContentPlanStatus,
  type GenerateContentPlanInput,
  type UpdateContentPlanInput,
  type UpdateContentPlanItemInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { browserTzOffset, queryString } from '../../lib/query';

/** Content Planner: /api/workspaces/:workspaceId/content-plans. */

const plansPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/content-plans`;
const planPath = (workspaceId: string, planId: string) =>
  `${plansPath(workspaceId)}/${encodeURIComponent(planId)}`;
const itemPath = (workspaceId: string, planId: string, itemId: string) =>
  `${planPath(workspaceId, planId)}/items/${encodeURIComponent(itemId)}`;

export function listContentPlans(
  workspaceId: string,
  filters: { status?: readonly ContentPlanStatus[] } = {},
  signal?: AbortSignal,
): Promise<ContentPlanListResponse> {
  return apiRequest(
    `${plansPath(workspaceId)}${queryString({ ...filters })}`,
    ContentPlanListResponseSchema,
    {
      signal,
    },
  );
}

export function getContentPlan(
  workspaceId: string,
  planId: string,
  signal?: AbortSignal,
): Promise<ContentPlanResponse> {
  return apiRequest(planPath(workspaceId, planId), ContentPlanResponseSchema, { signal });
}

/** Pixel genera la estrategia (puede tardar: usa el modelo). Envía la zona horaria del navegador. */
export function generateContentPlan(
  workspaceId: string,
  input: Omit<GenerateContentPlanInput, 'tzOffset'>,
): Promise<ContentPlanResponse> {
  return apiRequest(`${plansPath(workspaceId)}/generate`, ContentPlanResponseSchema, {
    method: 'POST',
    body: { ...input, tzOffset: browserTzOffset() },
  });
}

export function updateContentPlan(
  workspaceId: string,
  planId: string,
  input: UpdateContentPlanInput,
): Promise<ContentPlanResponse> {
  return apiRequest(planPath(workspaceId, planId), ContentPlanResponseSchema, {
    method: 'PATCH',
    body: input,
  });
}

/** DELETE archiva el plan (sus propuestas se conservan). */
export function archiveContentPlan(
  workspaceId: string,
  planId: string,
): Promise<ContentPlanResponse> {
  return apiRequest(planPath(workspaceId, planId), ContentPlanResponseSchema, { method: 'DELETE' });
}

export async function updateContentPlanItem(
  workspaceId: string,
  planId: string,
  itemId: string,
  input: UpdateContentPlanItemInput,
): Promise<ContentPlanItem> {
  return (
    await apiRequest(itemPath(workspaceId, planId, itemId), ContentPlanItemResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  ).item;
}

/** Convierte la propuesta en un ContentItem (idempotente). */
export function acceptContentPlanItem(
  workspaceId: string,
  planId: string,
  itemId: string,
): Promise<AcceptContentPlanItemResponse> {
  return apiRequest(
    `${itemPath(workspaceId, planId, itemId)}/accept`,
    AcceptContentPlanItemResponseSchema,
    {
      method: 'POST',
    },
  );
}

export async function rejectContentPlanItem(
  workspaceId: string,
  planId: string,
  itemId: string,
  reason?: string,
): Promise<ContentPlanItem> {
  return (
    await apiRequest(
      `${itemPath(workspaceId, planId, itemId)}/reject`,
      ContentPlanItemResponseSchema,
      {
        method: 'POST',
        body: reason ? { reason } : {},
      },
    )
  ).item;
}
