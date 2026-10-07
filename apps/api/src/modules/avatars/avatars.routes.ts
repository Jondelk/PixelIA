import type { AvatarResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import { generateAvatar, getAvatar } from './avatar.service.js';
import type { AvatarConceptEngine } from './engine/index.js';

/**
 * Módulo avatars — /api/companies/:companyId/avatar (legacy) y /api/workspaces/:workspaceId/avatar.
 * Montado detrás de requireAuth + requireCompanyAccess, o de requireWorkspaceAccess +
 * requireEnterpriseCompany: `req.workspace` y `req.company` ya están autorizados.
 */
export function createAvatarsRouter(deps: { avatarEngine: AvatarConceptEngine }): Router {
  const router = Router({ mergeParams: true });

  /** Avatar vigente, historial y si quedó desactualizado respecto al ADN. */
  router.get('/', async (req, res) => {
    const body: AvatarResponse = await getAvatar({
      workspace: getWorkspace(req),
      company: getCompany(req),
    });
    res.json(body);
  });

  /** Crea o regenera el concepto (nueva versión). 409 si aún no hay BrandDNA. */
  router.post('/generate', async (req, res) => {
    const body: AvatarResponse = await generateAvatar(
      { workspace: getWorkspace(req), company: getCompany(req) },
      deps.avatarEngine,
    );
    res.status(201).json(body);
  });

  return router;
}
