import {
  CreateCompanyInputSchema,
  UpdateCompanyInputSchema,
  type CompanyListResponse,
  type CompanyResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { notFound } from '../../lib/errors.js';
import { getAuth } from '../../middleware/requireAuth.js';
import { COMPANY_NOT_FOUND, getCompany } from '../../middleware/requireCompanyAccess.js';
import { toCompanyDTO } from './company.model.js';
import { createCompany, listCompanies, updateCompany } from './company.service.js';

/** /api/companies — colección de empresas del usuario autenticado. */
export const companiesRouter: Router = Router();

companiesRouter.post('/', async (req, res) => {
  const input = CreateCompanyInputSchema.parse(req.body);
  const company = await createCompany(getAuth(req).userId, input);
  const body: CompanyResponse = { company: toCompanyDTO(company) };
  res.status(201).json(body);
});

companiesRouter.get('/', async (req, res) => {
  const companies = await listCompanies(getAuth(req).userId);
  const body: CompanyListResponse = { companies: companies.map(toCompanyDTO) };
  res.json(body);
});

/** /api/companies/:companyId — empresa ya autorizada por requireCompanyAccess. */
export const companyRouter: Router = Router({ mergeParams: true });

companyRouter.get('/', (req, res) => {
  const body: CompanyResponse = { company: toCompanyDTO(getCompany(req)) };
  res.json(body);
});

companyRouter.patch('/', async (req, res) => {
  const input = UpdateCompanyInputSchema.parse(req.body);
  const company = await updateCompany(getAuth(req).userId, getCompany(req)._id.toString(), input);
  if (!company) throw notFound(COMPANY_NOT_FOUND);
  const body: CompanyResponse = { company: toCompanyDTO(company) };
  res.json(body);
});
