import { randomBytes } from 'node:crypto';
import type { GoogleCalendarConfig } from '../../src/modules/calendar/calendar.config.js';
import {
  CalendarError,
  GOOGLE_CALENDAR_SCOPES,
  type CalendarErrorCode,
  type CalendarEventPatch,
  type CalendarEventSummary,
  type GoogleCalendarProvider,
  type NewCalendarEvent,
  type TimeInterval,
} from '../../src/modules/calendar/calendar.types.js';

/*
 * Google falso para CI y el smoke (Prompt 19): OAuth y Calendar en memoria, sin red. Cuenta cada
 * llamada para comprobar «0 escrituras antes de confirmar» y permite simular fallos (token revocado,
 * caída, scopes insuficientes, conflicto que aparece después de proponer).
 */

interface StoredEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'cancelled';
  transparent: boolean;
  private: Record<string, string>;
}

type Operation =
  'exchange' | 'refresh' | 'revoke' | 'timezone' | 'list' | 'freeBusy' | 'insert' | 'get' | 'patch';

export const TEST_CALENDAR_CONFIG = (): GoogleCalendarConfig => ({
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret-never-logged',
  redirectUri: 'http://localhost:5173/api/calendar/google/callback',
  encryptionKey: randomBytes(32),
});

const overlaps = (a: TimeInterval, b: TimeInterval) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

export class FakeGoogleCalendar implements GoogleCalendarProvider {
  readonly events = new Map<string, StoredEvent>();
  readonly calls: Record<Operation, number> = {
    exchange: 0,
    refresh: 0,
    revoke: 0,
    timezone: 0,
    list: 0,
    freeBusy: 0,
    insert: 0,
    get: 0,
    patch: 0,
  };
  /** Tokens que Google consideraría válidos / revocados. */
  readonly revoked = new Set<string>();
  readonly issuedAccess = new Set<string>();
  readonly verifiers = new Map<string, string>();
  timezone: string | null = 'America/Bogota';
  grantedScopes: string[] = [...GOOGLE_CALENDAR_SCOPES];
  /** Simula que Google no devuelve refresh token. */
  omitRefreshToken = false;
  /** Fallo para la siguiente llamada de una operación (se consume). */
  readonly failNext = new Map<Operation, CalendarErrorCode>();
  /** Se ejecuta justo antes de cada inserción (p. ej. aparece otro evento en ese hueco). */
  beforeInsert: ((event: NewCalendarEvent) => void) | null = null;
  /** Caída total: todo lo de Calendar responde «no disponible». */
  down = false;
  /** El usuario revocó el acceso en su cuenta de Google (todo token deja de valer). */
  allRevoked = false;
  private counter = 0;

  /** Vuelve al estado inicial (entre tests). */
  reset() {
    this.events.clear();
    this.revoked.clear();
    this.issuedAccess.clear();
    this.verifiers.clear();
    this.failNext.clear();
    for (const key of Object.keys(this.calls) as Operation[]) this.calls[key] = 0;
    this.timezone = 'America/Bogota';
    this.grantedScopes = [...GOOGLE_CALENDAR_SCOPES];
    this.omitRefreshToken = false;
    this.beforeInsert = null;
    this.down = false;
    this.allRevoked = false;
  }

  /** Escrituras en Google (lo que «0 antes de confirmar» comprueba). */
  writes() {
    return this.calls.insert + this.calls.patch;
  }

  private fail(operation: Operation) {
    this.calls[operation] += 1;
    const code = this.failNext.get(operation);
    if (code) {
      this.failNext.delete(operation);
      throw new CalendarError(code);
    }
  }

  private requireAccess(token: string, operation: Operation) {
    this.fail(operation);
    if (this.down) throw new CalendarError('calendar_unavailable');
    if (!this.issuedAccess.has(token)) throw new CalendarError('calendar_requires_reauth');
  }

  private summary(event: StoredEvent): CalendarEventSummary {
    return {
      id: event.id,
      title: event.summary,
      start: new Date(event.start).toISOString(),
      end: new Date(event.end).toISOString(),
      allDay: event.allDay,
      cancelled: event.status === 'cancelled',
      transparent: event.transparent,
      pixel: {
        managed: event.private.pixelManaged === 'true',
        workspace: event.private.pixelWorkspace ?? null,
        action: event.private.pixelAction ?? null,
      },
    };
  }

  /** Un evento del usuario (no de Pixel), p. ej. una clase o una reunión. */
  addEvent(input: {
    title: string;
    start: string;
    end: string;
    allDay?: boolean;
    transparent?: boolean;
  }) {
    this.counter += 1;
    const id = `user${this.counter}event`;
    this.events.set(id, {
      id,
      summary: input.title,
      start: input.start,
      end: input.end,
      allDay: input.allDay ?? false,
      status: 'confirmed',
      transparent: input.transparent ?? false,
      private: {},
    });
    return id;
  }

  pixelEvents() {
    return [...this.events.values()].filter((event) => event.private.pixelManaged === 'true');
  }

  async createCodeVerifier() {
    this.counter += 1;
    const codeVerifier = `verifier-${this.counter}-${randomBytes(24).toString('base64url')}`;
    const codeChallenge = `challenge-${this.counter}`;
    this.verifiers.set(codeChallenge, codeVerifier);
    return { codeVerifier, codeChallenge };
  }

  createAuthUrl({
    state,
    codeChallenge,
    scopes,
  }: {
    state: string;
    codeChallenge: string;
    scopes: string[];
  }) {
    const params = new URLSearchParams({
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: scopes.join(' '),
      access_type: 'offline',
    });
    return `https://accounts.google.test/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** El código que «Google» emitiría para el último verificador (PKCE comprobado al canjear). */
  codeFor(codeChallenge: string) {
    return `code-for-${codeChallenge}`;
  }

  async exchangeCode({ code, codeVerifier }: { code: string; codeVerifier: string }) {
    this.fail('exchange');
    const challenge = code.replace(/^code-for-/, '');
    if (this.verifiers.get(challenge) !== codeVerifier) {
      throw new CalendarError('calendar_execution_failed');
    }
    this.counter += 1;
    const accessToken = `access-${this.counter}-${randomBytes(8).toString('hex')}`;
    const refreshToken = `refresh-${this.counter}-${randomBytes(8).toString('hex')}`;
    this.issuedAccess.add(accessToken);
    return {
      accessToken,
      refreshToken: this.omitRefreshToken ? null : refreshToken,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      scopes: this.grantedScopes,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    this.fail('refresh');
    if (this.allRevoked || this.revoked.has(refreshToken))
      throw new CalendarError('calendar_requires_reauth');
    this.counter += 1;
    const accessToken = `access-${this.counter}-${randomBytes(8).toString('hex')}`;
    this.issuedAccess.add(accessToken);
    return { accessToken, expiresAt: new Date(Date.now() + 60 * 60_000) };
  }

  async revoke(token: string) {
    this.fail('revoke');
    this.revoked.add(token);
  }

  /** Simula que el usuario revocó el acceso desde su cuenta de Google. */
  revokeEverything() {
    this.issuedAccess.clear();
    this.allRevoked = true;
  }

  async getTimezone(accessToken: string) {
    this.requireAccess(accessToken, 'timezone');
    return this.timezone;
  }

  async listEvents(
    accessToken: string,
    _calendarId: string,
    range: TimeInterval,
    options: { pixelManagedOnly?: boolean } = {},
  ) {
    this.requireAccess(accessToken, 'list');
    return [...this.events.values()]
      .filter((event) => overlaps(event, range))
      .filter((event) => !options.pixelManagedOnly || event.private.pixelManaged === 'true')
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map((event) => this.summary(event));
  }

  async freeBusy(accessToken: string, _calendarId: string, range: TimeInterval) {
    this.requireAccess(accessToken, 'freeBusy');
    return [...this.events.values()]
      .filter((event) => event.status !== 'cancelled' && !event.transparent && !event.allDay)
      .filter((event) => overlaps(event, range))
      .map((event) => ({
        start: new Date(Math.max(Date.parse(event.start), Date.parse(range.start))).toISOString(),
        end: new Date(Math.min(Date.parse(event.end), Date.parse(range.end))).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  async insertEvent(accessToken: string, _calendarId: string, event: NewCalendarEvent) {
    this.requireAccess(accessToken, 'insert');
    this.beforeInsert?.(event);
    if (this.events.has(event.id)) throw new CalendarError('calendar_duplicate');
    const stored: StoredEvent = {
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end,
      allDay: false,
      status: 'confirmed',
      transparent: false,
      private: {
        pixelManaged: 'true',
        pixelWorkspace: event.pixel.workspace,
        pixelAction: event.pixel.action,
      },
    };
    this.events.set(event.id, stored);
    return this.summary(stored);
  }

  async getEvent(accessToken: string, _calendarId: string, id: string) {
    this.requireAccess(accessToken, 'get');
    const event = this.events.get(id);
    return event ? this.summary(event) : null;
  }

  async patchEvent(
    accessToken: string,
    _calendarId: string,
    id: string,
    patch: CalendarEventPatch,
  ) {
    this.requireAccess(accessToken, 'patch');
    const event = this.events.get(id);
    if (!event) throw new CalendarError('calendar_event_not_found');
    event.start = patch.start;
    event.end = patch.end;
    if (patch.summary) event.summary = patch.summary;
    return this.summary(event);
  }
}
