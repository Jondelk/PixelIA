import type { Request, RequestHandler } from 'express';
import { notFound } from '../lib/errors.js';
import { findOwnedCompany } from '../modules/companies/company.service.js';
import type { CompanyDocument } from '../modules/companies/company.model.js';
import { ensureCompanyWorkspace } from '../modules/workspaces/workspace.migration.js';
import { getAuth } from './requireAuth.js';

export const COMPANY_NOT_FOUND = 'Empresa no encontrada';

/**
 * Rutas legacy /api/companies/:companyId (Enterprise). Resuelve `:companyId`, verifica que
 * pertenece al usuario autenticado y adjunta además su workspace enterprise (`req.workspace`),
 * migrándolo si la empresa es anterior a los workspaces. Así los módulos trabajan siempre con el
 * workspace como contexto principal.
 * Debe montarse después de requireAuth en un router con `mergeParams: true`.
 * Una empresa ajena, inexistente o un id malformado responden igual: 404.
 */
export const requireCompanyAccess: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuth(req);
  const { companyId } = req.params;
  const owned = typeof companyId === 'string' ? await findOwnedCompany(userId, companyId) : null;
  if (!owned) throw notFound(COMPANY_NOT_FOUND);
  const { company, workspace } = await ensureCompanyWorkspace(owned);
  // ensureCompanyWorkspace ya exige mismo dueño; se comprueba de nuevo contra la sesión.
  if (!workspace.ownerId.equals(userId)) throw notFound(COMPANY_NOT_FOUND);
  req.company = company;
  req.workspace = workspace;
  next();
};

/** Acceso tipado a la empresa ya autorizada por requireCompanyAccess o requireEnterpriseCompany. */
export function getCompany(req: Request): CompanyDocument {
  if (!req.company) throw notFound(COMPANY_NOT_FOUND);
  return req.company;
}
