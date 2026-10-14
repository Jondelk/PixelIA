import {
  CreateCompanyInputSchema,
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  type CompanyResponse,
  type WorkspaceListResponse,
  type WorkspaceResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { notFound } from '../../lib/errors.js';
import { getAuth } from '../../middleware/requireAuth.js';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import { toCompanyDTO } from '../companies/company.model.js';
import { createWorkspaceCompany } from '../companies/company.service.js';
import {
  createWorkspace,
  getWorkspaceOverview,
  listWorkspaceOverviews,
  updateWorkspace,
  WORKSPACE_NOT_FOUND,
} from './workspace.service.js';

/** /api/workspaces — workspaces ("Pixels") del usuario autenticado. */
export const workspacesRouter: Router = Router();

/**
 * Crea un workspace vacío. Enterprise: queda "sin configurar" hasta asociarle una empresa
 * (POST /api/companies con workspaceId). Personal: uno por usuario; su onboarding llega después.
 */
workspacesRouter.post('/', async (req, res) => {
  const input = CreateWorkspaceSchema.parse(req.body);
  const workspace = await createWorkspace(getAuth(req).userId, input);
  const body: WorkspaceResponse = await getWorkspaceOverview(workspace);
  res.status(201).json(body);
});

workspacesRouter.get('/', async (req, res) => {
  const body: WorkspaceListResponse = {
    workspaces: await listWorkspaceOverviews(getAuth(req).userId),
  };
  res.json(body);
});

/** /api/workspaces/:workspaceId — workspace ya autorizado por requireWorkspaceAccess. */
export const workspaceRouter: Router = Router({ mergeParams: true });

workspaceRouter.get('/', async (req, res) => {
  const body: WorkspaceResponse = await getWorkspaceOverview(getWorkspace(req));
  res.json(body);
});

workspaceRouter.patch('/', async (req, res) => {
  const input = UpdateWorkspaceSchema.parse(req.body);
  const workspace = await updateWorkspace(
    getAuth(req).userId,
    getWorkspace(req)._id.toString(),
    input,
  );
  if (!workspace) throw notFound(WORKSPACE_NOT_FOUND);
  const body: WorkspaceResponse = await getWorkspaceOverview(workspace);
  res.json(body);
});

/** Completa un Workspace enterprise creado sin empresa (flujo Enterprise existente). */
workspaceRouter.post('/company', async (req, res) => {
  const input = CreateCompanyInputSchema.parse(req.body);
  const company = await createWorkspaceCompany(getWorkspace(req), input);
  const body: CompanyResponse = { company: toCompanyDTO(company) };
  res.status(201).json(body);
});
