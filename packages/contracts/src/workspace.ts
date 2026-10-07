import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { CompanySchema } from './company.js';

/*
 * Workspace: el contenedor contextual de Pixel (ver docs/WORKSPACES.md).
 * Un usuario tiene N workspaces. Cada uno es de un tipo:
 * - enterprise: Pixel como director creativo de una marca (Workspace → Company → BrandDNA).
 * - personal: Pixel como director creativo personal (Workspace → PersonalProfile → PersonalDNA, próximamente).
 * Los recursos compartidos (AvatarProfile, Conversation, CreativeMemory…) cuelgan de workspaceId.
 */

export const WorkspaceTypeSchema = z.enum(['enterprise', 'personal']);
export type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;

export const WorkspaceStatusSchema = z.enum(['active', 'archived']);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceSchema = z.object({
  id: ObjectIdSchema,
  ownerId: ObjectIdSchema,
  type: WorkspaceTypeSchema,
  name: z.string(),
  slug: z.string(),
  status: WorkspaceStatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
/** Forma pública de un Workspace tal como la expone la API. */
export type WorkspaceDTO = Workspace;

const workspaceName = z
  .string()
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .max(120, 'Máximo 120 caracteres');

/** POST /api/workspaces. El tipo no se puede cambiar después. */
export const CreateWorkspaceSchema = z.object({
  type: WorkspaceTypeSchema,
  name: workspaceName,
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

/** PATCH /api/workspaces/:workspaceId. Ni el tipo ni el dueño son editables. */
export const UpdateWorkspaceSchema = z
  .object({ name: workspaceName, status: WorkspaceStatusSchema })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

/** Resumen del Pixel Personal para "Tus Pixels" (null en enterprise). */
export const PersonalSummarySchema = z.object({
  /** Nombre del perfil personal (null si aún no hay perfil). */
  name: z.string().nullable(),
  completedSteps: z.number().int().min(0),
  /** null = sin PersonalDNA todavía ("Configurar"). */
  personalDnaVersion: z.number().int().min(1).nullable(),
});
export type PersonalSummary = z.infer<typeof PersonalSummarySchema>;

/**
 * Workspace con su contexto de dominio resumido.
 * - enterprise: `company` es su empresa (null si aún no se configuró); `personal` es null.
 * - personal: `personal` resume su perfil y su ADN; `company` es siempre null.
 */
export const WorkspaceOverviewSchema = z.object({
  workspace: WorkspaceSchema,
  company: CompanySchema.nullable(),
  personal: PersonalSummarySchema.nullable(),
});
export type WorkspaceOverview = z.infer<typeof WorkspaceOverviewSchema>;

export const WorkspaceResponseSchema = WorkspaceOverviewSchema;
export type WorkspaceResponse = WorkspaceOverview;

export const WorkspaceListResponseSchema = z.object({
  workspaces: z.array(WorkspaceOverviewSchema),
});
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;

/** Etiquetas de producto (UI en español). */
export const WORKSPACE_TYPE_LABELS: Record<WorkspaceType, string> = {
  enterprise: 'Empresa',
  personal: 'Personal',
};
