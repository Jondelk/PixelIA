import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * Conexión de un Pixel Personal con Google Calendar (Prompt 19). Recurso del workspace
 * (tenantScoped) y de su dueño: una conexión nunca se usa desde otro workspace, aunque sea del
 * mismo usuario. Los tokens se guardan CIFRADOS (AES-256-GCM, lib/secretBox.ts) y con
 * `select: false`: no salen en ninguna consulta salvo la del servicio que los necesita, y nunca en
 * la API, PixelCommand, ActionResult, Creative Memory ni los logs.
 */

export type CalendarConnectionState = 'connected' | 'requires_reauth' | 'disconnected';

export interface CalendarConnectionAttrs {
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  provider: 'google';
  status: CalendarConnectionState;
  refreshTokenSealed: string | null;
  accessTokenSealed: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
  /** Calendario donde Pixel lee y escribe: lo decide el servidor (hoy, el principal). */
  calendarId: string;
  timezone: string | null;
  accountLabel: string | null;
  connectedAt: Date | null;
  lastValidatedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarConnectionDocument = HydratedDocument<CalendarConnectionAttrs>;

const schema = new Schema<CalendarConnectionAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['google'], required: true, default: 'google' },
    status: {
      type: String,
      enum: ['connected', 'requires_reauth', 'disconnected'],
      required: true,
    },
    refreshTokenSealed: { type: String, default: null, select: false },
    accessTokenSealed: { type: String, default: null, select: false },
    accessTokenExpiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },
    calendarId: { type: String, required: true, default: 'primary', maxlength: 200 },
    timezone: { type: String, default: null, maxlength: 64 },
    accountLabel: { type: String, default: null, maxlength: 120 },
    connectedAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Una conexión por workspace, dueño y proveedor (reconectar actualiza la misma).
schema.index({ workspaceId: 1, userId: 1, provider: 1 }, { unique: true });
schema.plugin(tenantScoped, { key: 'workspaceId' });

export const CalendarConnectionModel = model<CalendarConnectionAttrs>(
  'CalendarConnection',
  schema,
  'calendar_connections',
);
