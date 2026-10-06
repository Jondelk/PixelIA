import type { Request, RequestHandler } from 'express';
import { notFound } from '../lib/errors.js';
import { findOwnedCompany } from '../modules/companies/company.service.js';
import type { CompanyDocument } from '../modules/companies/company.model.js';
import { getAuth } from './requireAuth.js';

export const COMPANY_NOT_FOUND = 'Empresa no encontrada';

/**
 * Resuelve `:companyId` y verifica que pertenece al usuario autenticado.
 * Debe montarse después de requireAuth en un router con `mergeParams: true`.
 * Una empresa ajena, inexistente o un id malformado responden igual: 404,
 * para no revelar qué empresas existen.
 */
export const requireCompanyAccess: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuth(req);
  const { companyId } = req.params;
  const company = typeof companyId === 'string' ? await findOwnedCompany(userId, companyId) : null;
  if (!company) throw notFound(COMPANY_NOT_FOUND);
  req.company = company;
  next();
};

/** Acceso tipado a la empresa ya autorizada por requireCompanyAccess. */
export function getCompany(req: Request): CompanyDocument {
  if (!req.company) throw notFound(COMPANY_NOT_FOUND);
  return req.company;
}
