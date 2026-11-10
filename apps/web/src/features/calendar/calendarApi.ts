import {
  CalendarConnectionResponseSchema,
  StartCalendarConnectResponseSchema,
  type CalendarConnection,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';

/*
 * Google Calendar (Prompt 19): solo el ciclo de vida de la conexión. La web nunca ve tokens ni
 * escribe eventos: guardar bloques es una propuesta de PixelCommand que el usuario confirma.
 */

const calendarPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/calendar`;

export async function getCalendarConnection(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<CalendarConnection> {
  const { connection } = await apiRequest(
    `${calendarPath(workspaceId)}/connection`,
    CalendarConnectionResponseSchema,
    { signal },
  );
  return connection;
}

/** Pide la URL de Google (estado de un solo uso + PKCE en el servidor) y navega a ella. */
export async function startCalendarConnect(
  workspaceId: string,
  returnTo: 'home' | 'pixel' | 'agenda',
): Promise<void> {
  const { authUrl } = await apiRequest(
    `${calendarPath(workspaceId)}/connect`,
    StartCalendarConnectResponseSchema,
    { method: 'POST', body: { returnTo } },
  );
  window.location.assign(authUrl);
}

export async function disconnectCalendar(workspaceId: string): Promise<CalendarConnection> {
  const { connection } = await apiRequest(
    `${calendarPath(workspaceId)}/disconnect`,
    CalendarConnectionResponseSchema,
    { method: 'POST' },
  );
  return connection;
}

/** Zona IANA del navegador: el último recurso para planificar (la API la valida). */
export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
