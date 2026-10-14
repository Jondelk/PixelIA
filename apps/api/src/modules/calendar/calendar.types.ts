import type { ActionErrorCode } from '../actions/action.types.js';

/*
 * Tipos de calendario de Pixel (Prompt 19). Nada de tipos del SDK de Google fuera del adaptador
 * (`google.provider.ts`): PixelTool, PixelActionPlan y la web solo ven estos.
 */

/** Intervalo [start, end) en instantes absolutos (ISO UTC). */
export interface TimeInterval {
  start: string;
  end: string;
}

/** Un evento, normalizado y mínimo: sin participantes, sin descripción, sin datos que no hagan falta. */
export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  /** Cancelado: no ocupa. */
  cancelled: boolean;
  /** «Disponible» en Google (transparente): no ocupa. */
  transparent: boolean;
  /** Propiedades privadas de Pixel (marca de evento gestionado, acción, workspace). */
  pixel: { managed: boolean; workspace: string | null; action: string | null };
}

export interface NewCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  timezone: string;
  description: string | null;
  pixel: { workspace: string; action: string };
}

export interface CalendarEventPatch {
  start: string;
  end: string;
  timezone: string;
  summary?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Errores normalizados. `calendar_duplicate` es interno (un id de evento ya usado: la base de la
 * idempotencia externa). El resto son los de la Action Foundation.
 */
export type CalendarErrorCode =
  | Extract<
      ActionErrorCode,
      | 'calendar_not_connected'
      | 'calendar_requires_reauth'
      | 'calendar_permission_denied'
      | 'calendar_rate_limited'
      | 'calendar_unavailable'
      | 'calendar_event_not_found'
      | 'calendar_conflict'
      | 'calendar_invalid_time'
      | 'calendar_execution_failed'
      | 'calendar_verification_failed'
    >
  | 'calendar_duplicate';

export class CalendarError extends Error {
  /** Lo lee el ActionExecutor (`errorCodeOf`): llega normalizado, nunca la respuesta de Google. */
  readonly actionErrorCode: ActionErrorCode;

  constructor(
    readonly code: CalendarErrorCode,
    message = 'Google Calendar no pudo completar la operación',
  ) {
    super(message);
    this.name = 'CalendarError';
    this.actionErrorCode = code === 'calendar_duplicate' ? 'calendar_execution_failed' : code;
  }
}

/**
 * Adaptador de Google (OAuth + Calendar v3). Trabaja con tokens ya descifrados y NO toca Mongo: la
 * conexión, el cifrado y la renovación viven en `calendarConnection.service.ts`. Así los tests y el
 * smoke usan uno falso sin red.
 */
export interface GoogleCalendarProvider {
  createCodeVerifier(): Promise<{ codeVerifier: string; codeChallenge: string }>;
  createAuthUrl(input: { state: string; codeChallenge: string; scopes: string[] }): string;
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<GoogleTokens>;
  refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt: Date | null }>;
  revoke(token: string): Promise<void>;
  /** Zona horaria del calendario del usuario (ajuste «timezone»). */
  getTimezone(accessToken: string): Promise<string | null>;
  listEvents(
    accessToken: string,
    calendarId: string,
    range: TimeInterval,
    options?: { pixelManagedOnly?: boolean },
  ): Promise<CalendarEventSummary[]>;
  freeBusy(accessToken: string, calendarId: string, range: TimeInterval): Promise<TimeInterval[]>;
  /** Con un id dado por Pixel; si ya existe, lanza CalendarError('calendar_duplicate'). */
  insertEvent(
    accessToken: string,
    calendarId: string,
    event: NewCalendarEvent,
  ): Promise<CalendarEventSummary>;
  getEvent(
    accessToken: string,
    calendarId: string,
    id: string,
  ): Promise<CalendarEventSummary | null>;
  patchEvent(
    accessToken: string,
    calendarId: string,
    id: string,
    patch: CalendarEventPatch,
  ): Promise<CalendarEventSummary>;
}

/** Scopes mínimos (docs/GOOGLE-CALENDAR.md §Scopes). */
export const GOOGLE_CALENDAR_SCOPES = [
  // Leer, crear y actualizar eventos (los de Pixel; nunca se borran).
  'https://www.googleapis.com/auth/calendar.events',
  // Disponibilidad (ocupado/libre) sin leer el contenido de cada evento.
  'https://www.googleapis.com/auth/calendar.freebusy',
  // Solo la zona horaria del calendario.
  'https://www.googleapis.com/auth/calendar.settings.readonly',
] as const;

/** Lo que el usuario ve sobre los permisos (sin URLs de scopes). */
export const GOOGLE_CALENDAR_SCOPE_SUMMARY = [
  'Ver tu disponibilidad (ocupado o libre)',
  'Ver tus eventos para planificar a su alrededor',
  'Crear y mover los bloques que apruebes',
  'Leer la zona horaria de tu calendario',
];
