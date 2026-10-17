import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { GoogleCalendarConfig } from './calendar.config.js';
import {
  CalendarError,
  type CalendarErrorCode,
  type CalendarEventPatch,
  type CalendarEventSummary,
  type GoogleCalendarProvider,
  type NewCalendarEvent,
  type TimeInterval,
} from './calendar.types.js';

/*
 * Adaptador real de Google (Prompt 19). OAuth con la librería oficial `google-auth-library`
 * (Authorization Code + PKCE S256, `access_type=offline`); Calendar v3 con `fetch` y el token de
 * acceso en la cabecera. Nunca registra tokens, cabeceras ni el código. Los errores salen
 * normalizados (CalendarError): nada de la respuesta de Google llega a Pixel.
 *
 * Sin reintentos automáticos: las lecturas fallidas se informan; las escrituras son idempotentes
 * por id de evento (un reintento del ejecutor no duplica).
 */

const API = 'https://www.googleapis.com/calendar/v3';
const PRIVATE = {
  managed: 'pixelManaged',
  workspace: 'pixelWorkspace',
  action: 'pixelAction',
  /** Prompt 20: referencia opaca de la tarea (nunca su título ni su id de Mongo). */
  task: 'pixelTask',
};

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

function codeFor(status: number, body: unknown): CalendarErrorCode {
  const reason = JSON.stringify(body ?? {});
  if (status === 401) return 'calendar_requires_reauth';
  if (status === 403) {
    return /rateLimit|userRateLimit|quotaExceeded/.test(reason)
      ? 'calendar_rate_limited'
      : 'calendar_permission_denied';
  }
  if (status === 404 || status === 410) return 'calendar_event_not_found';
  if (status === 409) return 'calendar_duplicate';
  if (status === 429) return 'calendar_rate_limited';
  if (status === 400) return 'calendar_invalid_time';
  return status >= 500 ? 'calendar_unavailable' : 'calendar_execution_failed';
}

async function call<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CalendarError('calendar_unavailable');
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new CalendarError(codeFor(res.status, body));
  }
  return (await res.json()) as T;
}

function toSummary(event: GoogleEvent): CalendarEventSummary {
  const priv = event.extendedProperties?.private ?? {};
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const iso = (value?: { dateTime?: string; date?: string }) =>
    new Date(value?.dateTime ?? `${value?.date ?? '1970-01-01'}T00:00:00Z`).toISOString();
  return {
    id: event.id,
    title: event.summary ?? '(Sin título)',
    start: iso(event.start),
    end: iso(event.end),
    allDay,
    startDate: allDay ? (event.start?.date ?? null) : null,
    endDate: allDay ? (event.end?.date ?? null) : null,
    cancelled: event.status === 'cancelled',
    transparent: event.transparency === 'transparent',
    pixel: {
      managed: priv[PRIVATE.managed] === 'true',
      workspace: priv[PRIVATE.workspace] ?? null,
      action: priv[PRIVATE.action] ?? null,
      task: priv[PRIVATE.task] ?? null,
    },
  };
}

export function createGoogleCalendarProvider(config: GoogleCalendarConfig): GoogleCalendarProvider {
  const oauth = () => new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  const calendarPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}`;

  return {
    async createCodeVerifier() {
      const { codeVerifier, codeChallenge } = await oauth().generateCodeVerifierAsync();
      if (!codeChallenge) throw new Error('No se pudo generar el código PKCE');
      return { codeVerifier, codeChallenge };
    },

    createAuthUrl({ state, codeChallenge, scopes }) {
      return oauth().generateAuthUrl({
        access_type: 'offline',
        // Siempre consentimiento: garantiza el refresh token (también al reconectar).
        prompt: 'consent',
        include_granted_scopes: false,
        scope: scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
    },

    async exchangeCode({ code, codeVerifier }) {
      const { tokens } = await oauth().getToken({ code, codeVerifier });
      if (!tokens.access_token) throw new CalendarError('calendar_execution_failed');
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
      };
    },

    async refreshAccessToken(refreshToken) {
      const client = oauth();
      client.setCredentials({ refresh_token: refreshToken });
      try {
        const { credentials } = await client.refreshAccessToken();
        if (!credentials.access_token) throw new CalendarError('calendar_requires_reauth');
        return {
          accessToken: credentials.access_token,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        };
      } catch (err) {
        if (err instanceof CalendarError) throw err;
        // invalid_grant = revocado o caducado: hay que reconectar. Lo demás, temporal.
        const message = err instanceof Error ? err.message : '';
        throw new CalendarError(
          /invalid_grant|unauthorized_client|invalid_client/.test(message)
            ? 'calendar_requires_reauth'
            : 'calendar_unavailable',
        );
      }
    },

    async revoke(token) {
      await oauth().revokeToken(token);
    },

    async getTimezone(accessToken) {
      const setting = await call<{ value?: string }>(accessToken, '/users/me/settings/timezone');
      return setting.value ?? null;
    },

    async listEvents(accessToken, calendarId, range, options = {}) {
      const params = new URLSearchParams({
        timeMin: range.start,
        timeMax: range.end,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      if (options.pixelManagedOnly)
        params.set('privateExtendedProperty', `${PRIVATE.managed}=true`);
      // Prompt 20: rangos largos (Próximos) pueden tener más de una página; como mucho 4 (1000
      // eventos), sin bucles infinitos.
      const events: GoogleEvent[] = [];
      for (let page = 0; page < 4; page += 1) {
        const body = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
          accessToken,
          `${calendarPath(calendarId)}/events?${params.toString()}`,
        );
        events.push(...(body.items ?? []));
        if (!body.nextPageToken) break;
        params.set('pageToken', body.nextPageToken);
      }
      return events.map(toSummary);
    },

    async freeBusy(accessToken, calendarId, range) {
      const body = await call<{
        calendars?: Record<string, { busy?: TimeInterval[]; errors?: unknown[] }>;
      }>(accessToken, '/freeBusy', {
        method: 'POST',
        body: JSON.stringify({
          timeMin: range.start,
          timeMax: range.end,
          items: [{ id: calendarId }],
        }),
      });
      const calendar = body.calendars?.[calendarId];
      if (!calendar || calendar.errors?.length) throw new CalendarError('calendar_unavailable');
      return (calendar.busy ?? []).map((busy) => ({
        start: new Date(busy.start).toISOString(),
        end: new Date(busy.end).toISOString(),
      }));
    },

    async insertEvent(accessToken, calendarId, event: NewCalendarEvent) {
      const created = await call<GoogleEvent>(accessToken, `${calendarPath(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          id: event.id,
          summary: event.summary,
          description: event.description ?? undefined,
          start: { dateTime: event.start, timeZone: event.timezone },
          end: { dateTime: event.end, timeZone: event.timezone },
          extendedProperties: {
            private: {
              [PRIVATE.managed]: 'true',
              [PRIVATE.workspace]: event.pixel.workspace,
              [PRIVATE.action]: event.pixel.action,
              ...(event.pixel.task ? { [PRIVATE.task]: event.pixel.task } : {}),
            },
          },
        }),
      });
      return toSummary(created);
    },

    async getEvent(accessToken, calendarId, id) {
      try {
        return toSummary(
          await call<GoogleEvent>(
            accessToken,
            `${calendarPath(calendarId)}/events/${encodeURIComponent(id)}`,
          ),
        );
      } catch (err) {
        if (err instanceof CalendarError && err.code === 'calendar_event_not_found') return null;
        throw err;
      }
    },

    async patchEvent(accessToken, calendarId, id, patch: CalendarEventPatch) {
      const updated = await call<GoogleEvent>(
        accessToken,
        `${calendarPath(calendarId)}/events/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            start: { dateTime: patch.start, timeZone: patch.timezone },
            end: { dateTime: patch.end, timeZone: patch.timezone },
            ...(patch.summary ? { summary: patch.summary } : {}),
          }),
        },
      );
      return toSummary(updated);
    },
  };
}
