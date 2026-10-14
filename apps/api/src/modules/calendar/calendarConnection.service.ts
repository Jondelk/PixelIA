import { createHash, randomBytes } from 'node:crypto';
import type {
  CalendarConnection,
  CalendarConnectionStatus,
  StartCalendarConnectInput,
} from '@pixel/contracts';
import { StartCalendarConnectSchema } from '@pixel/contracts';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { openSecret, sealSecret } from '../../lib/secretBox.js';
import { WorkspaceModel, type WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { GoogleCalendarConfig } from './calendar.config.js';
import {
  CalendarError,
  GOOGLE_CALENDAR_SCOPE_SUMMARY,
  GOOGLE_CALENDAR_SCOPES,
  type CalendarEventPatch,
  type CalendarEventSummary,
  type GoogleCalendarProvider,
  type NewCalendarEvent,
  type TimeInterval,
} from './calendar.types.js';
import {
  CalendarConnectionModel,
  type CalendarConnectionAttrs,
  type CalendarConnectionDocument,
} from './calendarConnection.model.js';
import { CalendarOAuthStateModel, OAUTH_STATE_TTL_MS } from './calendarOAuthState.model.js';

/*
 * Ciclo de vida de la conexión con Google Calendar (Prompt 19, docs/GOOGLE-CALENDAR.md). Es la
 * ÚNICA capa que descifra tokens y la única que los renueva: las capacidades de la herramienta
 * reciben una sesión de calendario ya autenticada.
 */

export interface CalendarDeps {
  /** null = esta instalación no tiene Google configurado (herramienta «sin configurar»). */
  config: GoogleCalendarConfig | null;
  provider: GoogleCalendarProvider | null;
  logger: Logger;
  now: () => Date;
}

const PROVIDER = 'google' as const;
/**
 * Renovaciones en curso por conexión (single-flight): dos lecturas en paralelo de la misma petición
 * (disponibilidad + eventos) comparten UNA renovación en vez de pedir dos tokens a Google.
 */
const refreshing = new Map<string, Promise<string>>();
const ACCESS_TOKEN_MARGIN_MS = 60_000;

const ownerOf = (workspace: WorkspaceDocument) => workspace.ownerId;
const hashNonce = (nonce: string) => createHash('sha256').update(nonce).digest('hex');

const findConnection = (workspace: WorkspaceDocument, withSecrets = false) => {
  const query = CalendarConnectionModel.findOne({
    workspaceId: workspace._id,
    userId: ownerOf(workspace),
    provider: PROVIDER,
  });
  return withSecrets ? query.select('+refreshTokenSealed +accessTokenSealed') : query;
};

/** Estado real para este Pixel. Nunca consulta a Google (eso pasa al usarla). */
export async function calendarStatus(
  workspace: WorkspaceDocument,
  deps: CalendarDeps,
): Promise<CalendarConnectionStatus> {
  if (!deps.config || !deps.provider) return 'unconfigured';
  const connection = await findConnection(workspace);
  if (!connection || connection.status === 'disconnected') return 'requires_auth';
  return connection.status === 'connected' ? 'connected' : 'requires_reauth';
}

/** Respuesta segura (sin tokens, sin correo). */
export async function connectionView(
  workspace: WorkspaceDocument,
  deps: CalendarDeps,
): Promise<CalendarConnection> {
  const status = await calendarStatus(workspace, deps);
  const connection = status === 'unconfigured' ? null : await findConnection(workspace);
  const live = connection && connection.status !== 'disconnected' ? connection : null;
  return {
    provider: 'google',
    status,
    connected: status === 'connected',
    scopes: live ? GOOGLE_CALENDAR_SCOPE_SUMMARY : [],
    timezone: live?.timezone ?? null,
    accountLabel: live?.accountLabel ?? null,
    connectedAt: live?.connectedAt?.toISOString() ?? null,
  };
}

const notConfigured = () =>
  new AppError(
    409,
    'CONFLICT',
    'Google Calendar todavía no está configurado en esta instalación de Pixel',
    { reason: 'calendar_unconfigured' },
  );

/** Inicio del OAuth: estado de un solo uso + PKCE. Devuelve la URL de Google. */
export async function startCalendarConnect(
  workspace: WorkspaceDocument,
  userId: string,
  raw: StartCalendarConnectInput,
  deps: CalendarDeps,
): Promise<{ authUrl: string }> {
  if (!deps.config || !deps.provider) throw notConfigured();
  const input = StartCalendarConnectSchema.parse(raw);
  const nonce = randomBytes(32).toString('base64url');
  const { codeVerifier, codeChallenge } = await deps.provider.createCodeVerifier();
  await CalendarOAuthStateModel.create({
    nonceHash: hashNonce(nonce),
    userId: new Types.ObjectId(userId),
    workspaceId: workspace._id,
    codeVerifierSealed: sealSecret(codeVerifier, deps.config.encryptionKey),
    returnTo: input.returnTo,
    expiresAt: new Date(deps.now().getTime() + OAUTH_STATE_TTL_MS),
  });
  return {
    authUrl: deps.provider.createAuthUrl({
      state: nonce,
      codeChallenge,
      scopes: [...GOOGLE_CALENDAR_SCOPES],
    }),
  };
}

export type CallbackFailure =
  | 'denied'
  | 'state_invalid'
  | 'state_expired'
  | 'state_replayed'
  | 'session_mismatch'
  | 'workspace_invalid'
  | 'exchange_failed'
  | 'missing_refresh_token'
  | 'insufficient_scope'
  | 'unconfigured';

/** Solo rutas internas de una lista cerrada (nunca una URL recibida). */
const returnPath = (workspaceId: string, returnTo: 'home' | 'pixel') =>
  returnTo === 'home' ? `/workspace/${workspaceId}` : `/workspace/${workspaceId}/pixel`;

const withResult = (path: string, result: 'connected' | CallbackFailure) =>
  `${path}?calendar=${result === 'connected' ? 'connected' : `error&reason=${result}`}`;

/**
 * Callback de Google. Devuelve SIEMPRE una ruta interna a la que redirigir. Nunca confía en un
 * workspace, usuario o destino de la petición: salen del estado guardado en el servidor.
 */
export async function completeCalendarConnect(
  query: { state?: unknown; code?: unknown; error?: unknown },
  sessionUserId: string | null,
  deps: CalendarDeps,
): Promise<string> {
  const fallback = '/dashboard';
  if (!deps.config || !deps.provider) return withResult(fallback, 'unconfigured');
  if (typeof query.state !== 'string' || query.state.length < 20 || query.state.length > 200) {
    return withResult(fallback, 'state_invalid');
  }
  const now = deps.now();
  const nonceHash = hashNonce(query.state);
  // Consumo atómico: un estado solo vale una vez y antes de caducar.
  const state = await CalendarOAuthStateModel.findOneAndUpdate(
    { nonceHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!state) {
    const previous = await CalendarOAuthStateModel.findOne({ nonceHash });
    const reason: CallbackFailure = !previous
      ? 'state_invalid'
      : previous.usedAt
        ? 'state_replayed'
        : 'state_expired';
    deps.logger.warn('calendar.oauth_rejected', { reason });
    return withResult(fallback, reason);
  }
  const userId = state.userId.toString();
  if (!sessionUserId || sessionUserId !== userId) {
    deps.logger.warn('calendar.oauth_rejected', { reason: 'session_mismatch' });
    return withResult(fallback, 'session_mismatch');
  }
  const workspace = await WorkspaceModel.findOne({ _id: state.workspaceId, ownerId: state.userId });
  if (!workspace || workspace.type !== 'personal') {
    return withResult(fallback, 'workspace_invalid');
  }
  const back = returnPath(workspace._id.toString(), state.returnTo);
  if (typeof query.error === 'string') return withResult(back, 'denied');
  if (typeof query.code !== 'string' || !query.code) return withResult(back, 'exchange_failed');

  let tokens;
  try {
    tokens = await deps.provider.exchangeCode({
      code: query.code,
      codeVerifier: openSecret(state.codeVerifierSealed, deps.config.encryptionKey),
    });
  } catch {
    deps.logger.warn('calendar.oauth_exchange_failed', { workspaceId: workspace._id.toString() });
    return withResult(back, 'exchange_failed');
  }
  if (!tokens.refreshToken) return withResult(back, 'missing_refresh_token');
  const missing = GOOGLE_CALENDAR_SCOPES.filter((scope) => !tokens.scopes.includes(scope));
  if (missing.length) {
    // Concedió menos de lo necesario: no se guarda nada y se revoca lo concedido.
    await deps.provider.revoke(tokens.refreshToken).catch(() => undefined);
    return withResult(back, 'insufficient_scope');
  }
  const timezone = await deps.provider.getTimezone(tokens.accessToken).catch(() => null);
  const key = deps.config.encryptionKey;
  await CalendarConnectionModel.findOneAndUpdate(
    { workspaceId: workspace._id, userId: state.userId, provider: PROVIDER },
    {
      $set: {
        status: 'connected',
        refreshTokenSealed: sealSecret(tokens.refreshToken, key),
        accessTokenSealed: sealSecret(tokens.accessToken, key),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        calendarId: 'primary',
        timezone,
        accountLabel: 'Calendario principal',
        connectedAt: now,
        lastValidatedAt: now,
        disconnectedAt: null,
      },
    },
    { upsert: true, new: true },
  );
  deps.logger.info('calendar.connected', { workspaceId: workspace._id.toString() });
  return withResult(back, 'connected');
}

/** Desconectar: revoca en Google (si puede), borra los tokens. Los eventos ya creados se quedan. */
export async function disconnectCalendar(
  workspace: WorkspaceDocument,
  deps: CalendarDeps,
): Promise<CalendarConnection> {
  const connection = await findConnection(workspace, true);
  if (connection && connection.status !== 'disconnected') {
    const key = deps.config?.encryptionKey;
    if (key && deps.provider && connection.refreshTokenSealed) {
      try {
        await deps.provider.revoke(openSecret(connection.refreshTokenSealed, key));
      } catch {
        // No impide desconectar: los tokens locales se borran igual.
      }
    }
    await CalendarConnectionModel.updateOne(
      { _id: connection._id, workspaceId: workspace._id },
      {
        $set: {
          status: 'disconnected',
          refreshTokenSealed: null,
          accessTokenSealed: null,
          accessTokenExpiresAt: null,
          disconnectedAt: deps.now(),
        },
      },
    );
    deps.logger.info('calendar.disconnected', { workspaceId: workspace._id.toString() });
  }
  return connectionView(workspace, deps);
}

async function markRequiresReauth(connection: CalendarConnectionDocument, deps: CalendarDeps) {
  await CalendarConnectionModel.updateOne(
    { _id: connection._id, workspaceId: connection.workspaceId },
    { $set: { status: 'requires_reauth', accessTokenSealed: null, accessTokenExpiresAt: null } },
  );
  deps.logger.warn('calendar.requires_reauth', { workspaceId: connection.workspaceId.toString() });
}

/** Lo que la herramienta y el planificador usan: un calendario autenticado, sin ver tokens. */
export interface CalendarSession {
  calendarId: string;
  timezone: string | null;
  listEvents(
    range: TimeInterval,
    options?: { pixelManagedOnly?: boolean },
  ): Promise<CalendarEventSummary[]>;
  /** Ocupado real. Reutiliza la consulta del mismo rango en la misma sesión (una petición). */
  freeBusy(range: TimeInterval): Promise<TimeInterval[]>;
  insertEvent(event: NewCalendarEvent): Promise<CalendarEventSummary>;
  getEvent(id: string): Promise<CalendarEventSummary | null>;
  patchEvent(id: string, patch: CalendarEventPatch): Promise<CalendarEventSummary>;
}

/** Abre una sesión de calendario o lanza CalendarError (no conectado / reconectar). */
export async function openCalendarSession(
  workspace: WorkspaceDocument,
  deps: CalendarDeps,
): Promise<CalendarSession> {
  if (!deps.config || !deps.provider) throw new CalendarError('calendar_not_connected');
  const provider = deps.provider;
  const key = deps.config.encryptionKey;
  const connection = await findConnection(workspace, true);
  if (!connection || connection.status === 'disconnected') {
    throw new CalendarError('calendar_not_connected');
  }
  if (connection.status !== 'connected' || !connection.refreshTokenSealed) {
    throw new CalendarError('calendar_requires_reauth');
  }

  let accessToken: string | null = null;
  const flightKey = connection._id.toString();
  /** Una sola operación de token por conexión a la vez (las demás lecturas se suman a ella). */
  const singleFlight = (work: () => Promise<string>): Promise<string> => {
    const current = refreshing.get(flightKey);
    if (current) return current;
    const flight = work().finally(() => refreshing.delete(flightKey));
    refreshing.set(flightKey, flight);
    return flight;
  };
  /** Renueva con el refresh token y guarda el nuevo access token (cifrado). */
  const renew = async (): Promise<string> => {
    let refreshToken: string;
    try {
      refreshToken = openSecret(connection.refreshTokenSealed!, key);
    } catch {
      // Clave equivocada o datos alterados: la conexión no se puede usar con seguridad.
      await markRequiresReauth(connection, deps);
      throw new CalendarError('calendar_requires_reauth');
    }
    try {
      const fresh = await provider.refreshAccessToken(refreshToken);
      await CalendarConnectionModel.updateOne(
        { _id: connection._id, workspaceId: workspace._id },
        {
          $set: {
            accessTokenSealed: sealSecret(fresh.accessToken, key),
            accessTokenExpiresAt: fresh.expiresAt,
            lastValidatedAt: deps.now(),
          },
        },
      );
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof CalendarError && err.code === 'calendar_requires_reauth') {
        await markRequiresReauth(connection, deps);
      }
      throw err instanceof CalendarError ? err : new CalendarError('calendar_unavailable');
    }
  };
  /** El token guardado, si sigue vigente (con margen) y se puede descifrar. */
  const stored = (
    doc: Pick<CalendarConnectionAttrs, 'accessTokenSealed' | 'accessTokenExpiresAt'> | null,
  ) => {
    const expiresAt = doc?.accessTokenExpiresAt?.getTime() ?? 0;
    if (!doc?.accessTokenSealed || expiresAt - ACCESS_TOKEN_MARGIN_MS <= deps.now().getTime()) {
      return null;
    }
    try {
      return openSecret(doc.accessTokenSealed, key);
    } catch {
      return null;
    }
  };
  const reload = () =>
    CalendarConnectionModel.findOne({ _id: connection._id, workspaceId: workspace._id })
      .select('+accessTokenSealed')
      .lean();
  const token = async (): Promise<string> => {
    // Otra lectura pudo renovarlo hace un instante: se relee (dentro del vuelo) antes de pedir otro.
    accessToken ??=
      stored(connection) ?? (await singleFlight(async () => stored(await reload()) ?? renew()));
    return accessToken;
  };
  /** Tras un 401: renovar sí o sí (una vez). */
  const refresh = async (): Promise<string> => {
    accessToken = await singleFlight(renew);
    return accessToken;
  };
  /** Un 401 con un token que parecía válido: se renueva UNA vez y se reintenta UNA vez. */
  const run = async <T>(call: (accessToken: string) => Promise<T>): Promise<T> => {
    try {
      return await call(await token());
    } catch (err) {
      if (!(err instanceof CalendarError) || err.code !== 'calendar_requires_reauth') throw err;
      return call(await refresh());
    }
  };
  const busyCache = new Map<string, Promise<TimeInterval[]>>();
  const calendarId = connection.calendarId;
  return {
    calendarId,
    timezone: connection.timezone,
    listEvents: (range, options) => run((t) => provider.listEvents(t, calendarId, range, options)),
    freeBusy: (range) => {
      const cacheKey = `${range.start}|${range.end}`;
      if (!busyCache.has(cacheKey)) {
        const pending = run((t) => provider.freeBusy(t, calendarId, range));
        pending.catch(() => busyCache.delete(cacheKey));
        busyCache.set(cacheKey, pending);
      }
      return busyCache.get(cacheKey)!;
    },
    insertEvent: (event) => run((t) => provider.insertEvent(t, calendarId, event)),
    getEvent: (id) => run((t) => provider.getEvent(t, calendarId, id)),
    patchEvent: (id, patch) => run((t) => provider.patchEvent(t, calendarId, id, patch)),
  };
}

/** Referencia opaca del workspace para las propiedades privadas de los eventos de Pixel. */
export function workspaceEventRef(workspace: WorkspaceDocument): string {
  return createHash('sha256')
    .update(`pixel:${workspace._id.toString()}`)
    .digest('hex')
    .slice(0, 24);
}
