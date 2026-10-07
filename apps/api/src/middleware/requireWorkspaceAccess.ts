import type { Request, RequestHandler } from 'express';
import { conflict, notFound } from '../lib/errors.js';
import type { WorkspaceDocument } from '../modules/workspaces/workspace.model.js';
import {
  findOwnedWorkspace,
  findWorkspaceCompany,
  WORKSPACE_NOT_FOUND,
} from '../modules/workspaces/workspace.service.js';
import { getAuth } from './requireAuth.js';

/**
 * WorkspaceResolver de las rutas /api/workspaces/:workspaceId.
 * 1. lee `:workspaceId`; 2. verifica que existe; 3. verifica que su dueño es el usuario de la sesión
 * (workspace.ownerId === req.auth.userId); 4. lo adjunta como `req.workspace`.
 * Un workspace ajeno, inexistente o un id malformado responden igual: 404, para no revelar qué
 * workspaces existen. Debe montarse después de requireAuth en un router con `mergeParams: true`.
 * Nunca se confía en un workspaceId del cuerpo de la petición.
 */
export const requireWorkspaceAccess: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuth(req);
  const { workspaceId } = req.params;
  const workspace =
    typeof workspaceId === 'string' ? await findOwnedWorkspace(userId, workspaceId) : null;
  if (!workspace) throw notFound(WORKSPACE_NOT_FOUND);
  req.workspace = workspace;
  next();
};

/** Acceso tipado al workspace ya autorizado (por requireWorkspaceAccess o requireCompanyAccess). */
export function getWorkspace(req: Request): WorkspaceDocument {
  if (!req.workspace) throw notFound(WORKSPACE_NOT_FOUND);
  return req.workspace;
}

/**
 * Para rutas de workspace que solo existen en Enterprise (p. ej. el avatar derivado del BrandDNA):
 * resuelve la empresa DEL workspace autorizado y la adjunta como `req.company`.
 */
export const requireEnterpriseCompany: RequestHandler = async (req, _res, next) => {
  const workspace = getWorkspace(req);
  if (workspace.type !== 'enterprise') {
    throw conflict('Disponible en los Pixels de empresa. El Pixel Personal llegará pronto.');
  }
  const company = await findWorkspaceCompany(workspace);
  if (!company) throw conflict('Este Pixel de empresa aún no tiene una empresa configurada');
  req.company = company;
  next();
};
