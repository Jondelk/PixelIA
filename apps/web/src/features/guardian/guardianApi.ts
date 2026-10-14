import {
  GuardianReportListResponseSchema,
  GuardianReportResponseSchema,
  type EvaluateGuardianInput,
  type GuardianReport,
  type GuardianReportListResponse,
  type GuardianResourceType,
  type GuardianStatus,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';

/** Brand Guardian: /api/workspaces/:workspaceId/guardian (solo Enterprise). */

const guardianPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/guardian`;
const reportPath = (workspaceId: string, reportId: string) =>
  `${guardianPath(workspaceId)}/reports/${encodeURIComponent(reportId)}`;

export async function evaluateWithGuardian(
  workspaceId: string,
  input: EvaluateGuardianInput,
): Promise<GuardianReport> {
  const { report } = await apiRequest(
    `${guardianPath(workspaceId)}/evaluate`,
    GuardianReportResponseSchema,
    {
      method: 'POST',
      body: input,
    },
  );
  return report;
}

export async function getGuardianReport(
  workspaceId: string,
  reportId: string,
  signal?: AbortSignal,
): Promise<GuardianReport> {
  const { report } = await apiRequest(
    reportPath(workspaceId, reportId),
    GuardianReportResponseSchema,
    {
      signal,
    },
  );
  return report;
}

export function listGuardianReports(
  workspaceId: string,
  filters: {
    resourceType?: GuardianResourceType;
    resourceId?: string;
    status?: GuardianStatus;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<GuardianReportListResponse> {
  return apiRequest(
    `${guardianPath(workspaceId)}/reports${queryString({ ...filters })}`,
    GuardianReportListResponseSchema,
    { signal },
  );
}

async function reportAction(workspaceId: string, reportId: string, action: string, body?: object) {
  const { report } = await apiRequest(
    `${reportPath(workspaceId, reportId)}/${action}`,
    GuardianReportResponseSchema,
    {
      method: 'POST',
      ...(body ? { body } : {}),
    },
  );
  return report;
}

export const overrideGuardianFinding = (workspaceId: string, reportId: string, findingId: string) =>
  reportAction(workspaceId, reportId, 'override', { findingId });

export const correctWithPixel = (workspaceId: string, reportId: string) =>
  reportAction(workspaceId, reportId, 'correct');

export const applyGuardianCorrection = (workspaceId: string, reportId: string) =>
  reportAction(workspaceId, reportId, 'apply');
