import { model, Schema, type Types } from 'mongoose';

/*
 * Estado OAuth de Google Calendar (Prompt 19): anti-CSRF, de UN solo uso y que caduca. Se guarda
 * solo el hash del nonce (el valor viaja en `state`) y el verificador PKCE cifrado. El callback
 * consume el estado de forma atómica (`usedAt`), revalida que la sesión es del mismo usuario y que
 * el workspace sigue siendo suyo y Personal. `returnTo` es una pantalla de una lista cerrada, nunca
 * una URL. Lo borra el índice TTL.
 *
 * No es tenantScoped a propósito: en el callback aún no se conoce el workspace (Google solo
 * devuelve `state`); se busca por el hash del nonce y el workspace sale de aquí, del servidor.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export interface CalendarOAuthStateAttrs {
  nonceHash: string;
  userId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  codeVerifierSealed: string;
  returnTo: 'home' | 'pixel';
  expiresAt: Date;
  usedAt: Date | null;
}

const schema = new Schema<CalendarOAuthStateAttrs>(
  {
    nonceHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    codeVerifierSealed: { type: String, required: true },
    returnTo: { type: String, enum: ['home', 'pixel'], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ nonceHash: 1 }, { unique: true });
// Mongo borra los estados caducados (además, el callback rechaza los vencidos).
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CalendarOAuthStateModel = model<CalendarOAuthStateAttrs>(
  'CalendarOAuthState',
  schema,
  'calendar_oauth_states',
);
