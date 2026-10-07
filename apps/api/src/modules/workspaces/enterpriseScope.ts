import type { CompanyDocument } from '../companies/company.model.js';
import type { WorkspaceDocument } from './workspace.model.js';

/**
 * Contexto Enterprise ya autorizado: el workspace (frontera de aislamiento) y SU empresa.
 * Lo construyen los middlewares (requireCompanyAccess / requireEnterpriseCompany); nunca a partir
 * de ids del cliente.
 */
export interface EnterpriseScope {
  workspace: WorkspaceDocument;
  company: CompanyDocument;
}

/** Defensa en profundidad: la empresa debe pertenecer al workspace y al mismo dueño. */
export function assertEnterpriseScope(scope: EnterpriseScope): EnterpriseScope {
  const { workspace, company } = scope;
  if (
    workspace.type !== 'enterprise' ||
    !company.workspaceId?.equals(workspace._id) ||
    !company.ownerId.equals(workspace.ownerId)
  ) {
    throw new Error('La empresa no pertenece al workspace autorizado');
  }
  return scope;
}
