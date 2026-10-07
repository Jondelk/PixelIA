import type { AvatarResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { generateAvatar, getAvatar } from './avatar.service.js';
import type { AvatarConceptEngine } from './engine/index.js';

/**
 * Módulo avatars — /api/companies/:companyId/avatar.
 * Montado detrás de requireAuth + requireCompanyAccess: `req.company` ya está autorizada.
 */
export function createAvatarsRouter(deps: { avatarEngine: AvatarConceptEngine }): Router {
  const router = Router({ mergeParams: true });

  /** Avatar vigente, historial y si quedó desactualizado respecto al ADN. */
  router.get('/', async (req, res) => {
    const body: AvatarResponse = await getAvatar(getCompany(req));
    res.json(body);
  });

  /** Crea o regenera el concepto (nueva versión). 409 si aún no hay BrandDNA. */
  router.post('/generate', async (req, res) => {
    const body: AvatarResponse = await generateAvatar(getCompany(req), deps.avatarEngine);
    res.status(201).json(body);
  });

  return router;
}
