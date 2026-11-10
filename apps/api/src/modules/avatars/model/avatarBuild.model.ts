import type { AvatarModelStatus } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../../db/tenantScoped.plugin.js';

/**
 * Construcción 3D (Pixel Sculpt) de una versión del AvatarProfile (una por workspace y versión).
 * Recurso del workspace: aislado por workspaceId, como el AvatarProfile del que sale.
 * Los archivos viven en disco bajo STORAGE_DIR/avatars/<workspaceId>/v<version>/; aquí solo se
 * guarda el estado y qué archivos existen.
 */
export interface AvatarBuildAttrs {
  workspaceId: Types.ObjectId;
  /** Empresa del workspace en Enterprise (referencia; el aislamiento es por workspaceId); null en Personal. */
  companyId: Types.ObjectId | null;
  avatarVersion: number;
  status: AvatarModelStatus;
  /** Cambia en cada construcción: invalida cachés del navegador al reconstruir. */
  buildId: string;
  files: string[];
  engineVersion: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AvatarBuildDocument = HydratedDocument<AvatarBuildAttrs>;

const avatarBuildSchema = new Schema<AvatarBuildAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    avatarVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['queued', 'building', 'ready', 'failed'],
      required: true,
    },
    buildId: { type: String, required: true },
    files: { type: [String], default: [] },
    engineVersion: { type: String, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true },
);

avatarBuildSchema.index({ workspaceId: 1, avatarVersion: 1 }, { unique: true });
avatarBuildSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const AvatarBuildModel = model<AvatarBuildAttrs>(
  'AvatarBuild',
  avatarBuildSchema,
  'avatar_builds',
);
