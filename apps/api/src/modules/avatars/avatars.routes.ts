import type { AvatarResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  generateAvatar,
  generatePersonalAvatar,
  getAvatar,
  getPersonalAvatar,
  type AvatarEngines,
} from './avatar.service.js';

/**
 * Módulo avatars — /api/companies/:companyId/avatar (legacy) y /api/workspaces/:workspaceId/avatar.
 * Un solo endpoint para los dos tipos: el ADN de origen se resuelve por `workspace.type`
 * (enterprise → BrandDNA de su empresa; personal → PersonalDNA). Montado detrás de
 * requireCompanyAccess, o de requireWorkspaceAccess + resolveWorkspaceDomain: `req.workspace` (y en
 * Enterprise `req.company`) ya están autorizados.
 */
export function createAvatarsRouter(deps: AvatarEngines): Router {
  const router = Router({ mergeParams: true });

  /** Avatar vigente, historial y si quedó desactualizado respecto al ADN. */
  router.get('/', async (req, res) => {
    const workspace = getWorkspace(req);
    const body: AvatarResponse =
      workspace.type === 'personal'
        ? await getPersonalAvatar(workspace)
        : await getAvatar({ workspace, company: getCompany(req) });
    res.json(body);
  });

  /** Crea o regenera el concepto (nueva versión). 409 si aún no hay ADN. */
  router.post('/generate', async (req, res) => {
    const workspace = getWorkspace(req);
    const body: AvatarResponse =
      workspace.type === 'personal'
        ? await generatePersonalAvatar(workspace, deps.personalAvatarEngine)
        : await generateAvatar({ workspace, company: getCompany(req) }, deps.avatarEngine);
    res.status(201).json(body);
  });

  return router;
}
