import {
  WorkspaceStatusSchema,
  WorkspaceTypeSchema,
  type Workspace,
  type WorkspaceStatus,
  type WorkspaceType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface WorkspaceAttrs {
  ownerId: Types.ObjectId;
  type: WorkspaceType;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  /** Zona horaria IANA (explícita; null = DEFAULT_TIMEZONE). */
  timezone: string | null;
  /**
   * Solo la migración lo escribe: empresa legacy de la que nació este workspace. Su índice único
   * hace que migrar sea idempotente incluso si el proceso se interrumpe a mitad (ver
   * docs/WORKSPACE-MIGRATION.md). No sale en el DTO.
   */
  migratedFromCompanyId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceDocument = HydratedDocument<WorkspaceAttrs>;

/*
 * Workspace es la raíz de aislamiento (como lo era Company): no usa tenantScoped, y toda consulta
 * filtra por ownerId, que siempre viene de la sesión.
 */
const workspaceSchema = new Schema<WorkspaceAttrs>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: WorkspaceTypeSchema.options, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: WorkspaceStatusSchema.options,
      default: 'active',
      required: true,
    },
    timezone: { type: String, default: null, maxlength: 64 },
    migratedFromCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
  },
  { timestamps: true },
);

// Listado de los workspaces de un usuario ("Tus Pixels").
workspaceSchema.index({ ownerId: 1, createdAt: -1 });
// El slug es único entre los workspaces de un mismo dueño.
workspaceSchema.index({ ownerId: 1, slug: 1 }, { unique: true });
// Un único Pixel Personal por usuario. También sirve de índice por tipo para los personales;
// no hay índice solo por `type` (dos valores: no discrimina).
workspaceSchema.index(
  { ownerId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'personal' }, name: 'one_personal_per_owner' },
);
workspaceSchema.index(
  { migratedFromCompanyId: 1 },
  { unique: true, partialFilterExpression: { migratedFromCompanyId: { $exists: true } } },
);

export const WorkspaceModel = model<WorkspaceAttrs>('Workspace', workspaceSchema);

export function toWorkspaceDTO(workspace: WorkspaceDocument): Workspace {
  return {
    id: workspace._id.toString(),
    ownerId: workspace.ownerId.toString(),
    type: workspace.type,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
    timezone: workspace.timezone ?? null,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}
