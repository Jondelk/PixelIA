import type { CreateCompanyInput, UpdateCompanyInput } from '@pixel/contracts';
import { CreateCompanyInputSchema } from '@pixel/contracts';
import type { Types } from 'mongoose';
import { badRequest, conflict } from '../../lib/errors.js';
import { escapeRegex, isDuplicateKeyError, isObjectIdString } from '../../lib/mongo.js';
import { ensureOwnerWorkspaces } from '../workspaces/workspace.migration.js';
import { WorkspaceModel, type WorkspaceDocument } from '../workspaces/workspace.model.js';
import { createWorkspace, syncEnterpriseWorkspaceName } from '../workspaces/workspace.service.js';
import { CompanyModel, type CompanyDocument } from './company.model.js';
import { nextAvailableSlug, slugify } from './slug.js';

/*
 * Todas las consultas incluyen ownerId: un usuario solo puede ver o modificar sus empresas.
 * El ownerId siempre viene de la sesión (req.auth), nunca del cuerpo de la petición.
 * Cada empresa pertenece a un workspace enterprise del mismo dueño (Workspace → Company → BrandDNA).
 */

async function availableSlug(ownerId: string, name: string): Promise<string> {
  const base = slugify(name);
  const existing = await CompanyModel.find(
    { ownerId, slug: { $regex: `^${escapeRegex(base)}(-\\d+)?$` } },
    { slug: 1 },
  ).lean();
  return nextAvailableSlug(base, new Set(existing.map((company) => company.slug)));
}

type ParsedCreateInput = ReturnType<typeof CreateCompanyInputSchema.parse>;

async function insertCompany(
  ownerId: string,
  input: ParsedCreateInput,
  workspaceId: Types.ObjectId,
): Promise<CompanyDocument> {
  // Reintenta si dos creaciones simultáneas compiten por el mismo slug.
  for (let attempt = 0; ; attempt++) {
    const slug = await availableSlug(ownerId, input.name);
    try {
      return await CompanyModel.create({
        workspaceId,
        ownerId,
        name: input.name,
        slug,
        industry: input.industry,
        description: input.description,
        logoUrl: input.logoUrl ?? null,
        status: 'draft',
      });
    } catch (err) {
      if (isDuplicateKeyError(err, 'workspaceId')) {
        throw conflict('Este Pixel ya tiene una empresa');
      }
      if (!isDuplicateKeyError(err, 'slug') || attempt >= 3) throw err;
    }
  }
}

/**
 * Crea una empresa junto con su workspace enterprise: primero el workspace y después la empresa.
 * MongoDB local (standalone) no admite transacciones, así que si la empresa falla se deshace el
 * workspace (rollback lógico).
 */
async function rollbackEmptyWorkspace(ownerId: string, workspaceId: Types.ObjectId) {
  if (await CompanyModel.exists({ workspaceId, ownerId })) return;
  await WorkspaceModel.deleteOne({ _id: workspaceId, ownerId, type: 'enterprise' });
}

export async function createCompany(
  ownerId: string,
  rawInput: CreateCompanyInput,
): Promise<CompanyDocument> {
  const input = CreateCompanyInputSchema.parse(rawInput);
  const workspace = await createWorkspace(ownerId, { type: 'enterprise', name: input.name });
  try {
    return await insertCompany(ownerId, input, workspace._id);
  } catch (err) {
    // Rollback lógico: no dejar workspaces huérfanos. Solo si la empresa de verdad no se guardó:
    // sin retryable writes (MongoDB standalone) un corte de red puede llegar DESPUÉS de que el
    // insert se confirmara, y borrar el workspace dejaría esa empresa sin él. Si el rollback no se
    // puede hacer, el workspace queda como "Pixel de empresa sin configurar" y se completa en la app.
    await rollbackEmptyWorkspace(ownerId, workspace._id).catch(() => undefined);
    throw err;
  }
}

/**
 * Completa un workspace enterprise que se creó sin empresa. El workspace llega ya autorizado por
 * requireWorkspaceAccess (nunca de un id del cuerpo de la petición).
 */
export async function createWorkspaceCompany(
  workspace: WorkspaceDocument,
  rawInput: CreateCompanyInput,
): Promise<CompanyDocument> {
  const input = CreateCompanyInputSchema.parse(rawInput);
  if (workspace.type !== 'enterprise') {
    throw badRequest('Solo un Pixel de empresa puede tener una empresa', {
      reason: 'workspace_type_mismatch',
      expected: 'enterprise',
    });
  }
  const ownerId = workspace.ownerId.toString();
  if (await CompanyModel.exists({ workspaceId: workspace._id, ownerId })) {
    throw conflict('Este Pixel ya tiene una empresa');
  }
  // El índice único de Company.workspaceId resuelve la carrera entre dos peticiones simultáneas.
  const company = await insertCompany(ownerId, input, workspace._id);
  await syncEnterpriseWorkspaceName(company);
  return company;
}

export async function listCompanies(ownerId: string): Promise<CompanyDocument[]> {
  await ensureOwnerWorkspaces(ownerId);
  return CompanyModel.find({ ownerId }).sort({ createdAt: -1 });
}

/** null si no existe, si el id es inválido o si pertenece a otro usuario. */
export async function findOwnedCompany(
  ownerId: string,
  companyId: string,
): Promise<CompanyDocument | null> {
  if (!isObjectIdString(companyId) || !isObjectIdString(ownerId)) return null;
  return CompanyModel.findOne({ _id: companyId, ownerId });
}

/** El slug es estable: no cambia al renombrar la empresa. El nombre se refleja en su workspace. */
export async function updateCompany(
  ownerId: string,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<CompanyDocument | null> {
  if (!isObjectIdString(companyId)) return null;
  const company = await CompanyModel.findOneAndUpdate(
    { _id: companyId, ownerId },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  );
  if (company && input.name !== undefined) await syncEnterpriseWorkspaceName(company);
  return company;
}
