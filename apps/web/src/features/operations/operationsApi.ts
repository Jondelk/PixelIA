import { OperationsSummaryResponseSchema, type OperationsSummary } from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { browserTzOffset, queryString } from '../../lib/query';

/** Resumen operacional del Inicio: conteos y listas cortas de datos reales del workspace. */
export async function getOperationsSummary(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<OperationsSummary> {
  return (
    await apiRequest(
      `${workspaceApiBase(workspaceId)}/operations/summary${queryString({ tzOffset: browserTzOffset() })}`,
      OperationsSummaryResponseSchema,
      { signal },
    )
  ).summary;
}
