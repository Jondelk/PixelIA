import {
  DailyBriefListResponseSchema,
  DailyBriefResponseSchema,
  type DailyBriefListResponse,
  type DailyBriefResponse,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';

/** Daily Director: /api/workspaces/:workspaceId/daily-brief(s). */

/** Dirección vigente de hoy. 404 `daily_brief_not_generated` si aún no se generó. */
export function getDailyBrief(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<DailyBriefResponse> {
  return apiRequest(`${workspaceApiBase(workspaceId)}/daily-brief`, DailyBriefResponseSchema, {
    signal,
  });
}

/** Genera o regenera la dirección de hoy (una versión nueva del día). */
export function generateDailyBrief(workspaceId: string): Promise<DailyBriefResponse> {
  return apiRequest(
    `${workspaceApiBase(workspaceId)}/daily-brief/generate`,
    DailyBriefResponseSchema,
    {
      method: 'POST',
    },
  );
}

export function listDailyBriefs(
  workspaceId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<DailyBriefListResponse> {
  return apiRequest(
    `${workspaceApiBase(workspaceId)}/daily-briefs${queryString({ ...page })}`,
    DailyBriefListResponseSchema,
    { signal },
  );
}
