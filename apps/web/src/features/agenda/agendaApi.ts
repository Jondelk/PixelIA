import { AgendaResponseSchema, type AgendaView, type AgendaViewKind } from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';
import { browserTimezone } from '../calendar/calendarApi';

/**
 * «Mi agenda» (Prompt 20): GET /api/workspaces/:id/agenda. Solo lectura: la web pide una vista y un
 * día de referencia; el servidor resuelve rangos, días y etiquetas en la zona del usuario.
 */
export async function getAgenda(
  workspaceId: string,
  params: { view: AgendaViewKind; anchor?: string | null; horizon?: number | null },
  signal?: AbortSignal,
): Promise<AgendaView> {
  const { agenda } = await apiRequest(
    `${workspaceApiBase(workspaceId)}/agenda${queryString({
      view: params.view,
      anchor: params.anchor ?? undefined,
      horizon: params.view === 'upcoming' ? (params.horizon ?? undefined) : undefined,
      timezone: browserTimezone(),
    })}`,
    AgendaResponseSchema,
    { signal },
  );
  return agenda;
}
