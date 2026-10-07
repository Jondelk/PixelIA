import {
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type WorkspaceOverview,
} from '@pixel/contracts';
import { conflict } from '../../lib/errors.js';
import { isDuplicateKeyError, isObjectIdString } from '../../lib/mongo.js';
import { CompanyModel, toCompanyDTO, type CompanyDocument } from '../companies/company.model.js';
import { getPersonalSummary } from '../personal/personal.service.js';
import { ensureOwnerWorkspaces } from './workspace.migration.js';
import { toWorkspaceDTO, WorkspaceModel, type WorkspaceDocument } from './workspace.model.js';
import { availableWorkspaceSlug } from './workspace.slug.js';

/*
 * Workspaces: el contenedor contextual de Pixel. Todas las consultas filtran por ownerId, que
 * siempre viene de la sesión (req.auth), nunca del cuerpo de la petición.
 */

export const WORKSPACE_NOT_FOUND = 'Pixel no encontrado';

export async function createWorkspace(
  ownerId: string,
  rawInput: CreateWorkspaceInput,
): Promise<WorkspaceDocument> {
  const input = CreateWorkspaceSchema.parse(rawInput);
  // Reintenta si dos creaciones simultáneas compiten por el mismo slug.
  for (let attempt = 0; ; attempt++) {
    const slug = await availableWorkspaceSlug(ownerId, input.name);
    try {
      return await WorkspaceModel.create({
        ownerId,
        type: input.type,
        name: input.name,
        slug,
        status: 'active',
      });
    } catch (err) {
      if (isDuplicateKeyError(err, 'type')) {
        throw conflict('Ya tienes un Pixel Personal');
      }
      if (!isDuplicateKeyError(err, 'slug') || attempt >= 3) throw err;
    }
  }
}

/** null si no existe, si el id es inválido o si pertenece a otro usuario. */
export async function findOwnedWorkspace(
  ownerId: string,
  workspaceId: string,
): Promise<WorkspaceDocument | null> {
  if (!isObjectIdString(workspaceId) || !isObjectIdString(ownerId)) return null;
  return WorkspaceModel.findOne({ _id: workspaceId, ownerId });
}

/**
 * Empresa de un workspace enterprise (null si es personal o si aún no se configuró).
 * Comprueba también el dueño: una empresa solo se resuelve dentro de un workspace del mismo usuario.
 */
export async function findWorkspaceCompany(
  workspace: WorkspaceDocument,
): Promise<CompanyDocument | null> {
  if (workspace.type !== 'enterprise') return null;
  return CompanyModel.findOne({ workspaceId: workspace._id, ownerId: workspace.ownerId });
}

export async function getWorkspaceOverview(
  workspace: WorkspaceDocument,
): Promise<WorkspaceOverview> {
  const company = await findWorkspaceCompany(workspace);
  return {
    workspace: toWorkspaceDTO(workspace),
    company: company ? toCompanyDTO(company) : null,
    personal: await getPersonalSummary(workspace),
  };
}

/** "Tus Pixels": todos los workspaces del usuario con su empresa o su resumen personal. */
export async function listWorkspaceOverviews(ownerId: string): Promise<WorkspaceOverview[]> {
  // Empresas creadas antes de los workspaces: se migran aquí para que no desaparezcan del listado.
  await ensureOwnerWorkspaces(ownerId);
  const workspaces = await WorkspaceModel.find({ ownerId }).sort({ createdAt: -1 });
  const companies = await CompanyModel.find({
    ownerId,
    workspaceId: { $in: workspaces.map((workspace) => workspace._id) },
  });
  const byWorkspace = new Map(
    companies.map((company) => [company.workspaceId?.toString(), company] as const),
  );
  // Como mucho un workspace personal por usuario: una consulta (filtrada por su workspaceId).
  return Promise.all(
    workspaces.map(async (workspace) => {
      const company =
        workspace.type === 'enterprise' ? byWorkspace.get(workspace._id.toString()) : undefined;
      return {
        workspace: toWorkspaceDTO(workspace),
        company: company ? toCompanyDTO(company) : null,
        personal: await getPersonalSummary(workspace),
      };
    }),
  );
}

/** El tipo es inmutable. El nombre de un workspace enterprise no renombra su empresa. */
export async function updateWorkspace(
  ownerId: string,
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceDocument | null> {
  if (!isObjectIdString(workspaceId)) return null;
  return WorkspaceModel.findOneAndUpdate(
    { _id: workspaceId, ownerId },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  );
}

/** Mantiene el nombre del workspace enterprise igual al de su empresa al renombrarla. */
export async function syncEnterpriseWorkspaceName(company: CompanyDocument): Promise<void> {
  if (!company.workspaceId) return;
  await WorkspaceModel.updateOne(
    { _id: company.workspaceId, ownerId: company.ownerId, type: 'enterprise' },
    { $set: { name: company.name } },
  );
}
