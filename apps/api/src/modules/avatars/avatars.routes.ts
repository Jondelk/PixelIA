import type { AvatarModelResponse, AvatarResponse } from '@pixel/contracts';
import { Router, type Request } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  currentAvatarVersion,
  generateAvatar,
  generatePersonalAvatar,
  getAvatar,
  getPersonalAvatar,
  type AvatarEngines,
} from './avatar.service.js';
import type { AvatarModelService, ModelScope } from './model/avatarModel.service.js';

/**
 * Módulo avatars — /api/companies/:companyId/avatar (legacy) y /api/workspaces/:workspaceId/avatar.
 * Un solo endpoint para los dos tipos: el ADN de origen se resuelve por `workspace.type`
 * (enterprise → BrandDNA de su empresa; personal → PersonalDNA). Montado detrás de
 * requireCompanyAccess, o de requireWorkspaceAccess + resolveWorkspaceDomain: `req.workspace` (y en
 * Enterprise `req.company`) ya están autorizados.
 */
/** Workspace ya autorizado y la versión vigente de su avatar (Enterprise o Personal). */
async function scopeOf(req: Request): Promise<ModelScope> {
  const workspace = getWorkspace(req);
  if (workspace.type === 'personal') {
    return { workspace, companyId: null, avatarVersion: await currentAvatarVersion(workspace) };
  }
  const company = getCompany(req);
  return { workspace, companyId: company._id, avatarVersion: company.avatarVersion };
}

export function createAvatarsRouter(
  deps: AvatarEngines & { avatarModels: AvatarModelService },
): Router {
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
    // El concepto nuevo se esculpe en 3D en segundo plano (marca o persona).
    if (deps.avatarModels.autoBuild && body.avatar) {
      const scope = await scopeOf(req);
      void deps.avatarModels.enqueueQuietly(scope, body.avatar.version);
    }
    res.status(201).json(body);
  });

  /** Estado del modelo 3D para la versión vigente del avatar. */
  router.get('/model', async (req, res) => {
    const body: AvatarModelResponse = await deps.avatarModels.get(await scopeOf(req));
    res.json(body);
  });

  /**
   * Construye el modelo de la versión vigente (o lo reconstruye con ?force=true).
   * 202: la construcción sigue en segundo plano; el cliente consulta GET /model.
   * 503 si la producción 3D está desactivada; 409 si aún no hay concepto.
   */
  router.post('/model', async (req, res) => {
    const force = req.query.force === 'true';
    const body: AvatarModelResponse = await deps.avatarModels.request(await scopeOf(req), {
      force,
    });
    res.status(202).json(body);
  });

  /** Archivos del modelo vigente (glb y renders). Solo nombres conocidos. */
  router.get('/model/files/:fileName', async (req, res) => {
    const { fileName } = req.params;
    const path = await deps.avatarModels.filePath(await scopeOf(req), fileName);
    if (req.query.download === '1') res.attachment(fileName);
    // La URL incluye el id de construcción (?b=…): si el modelo cambia, cambia la URL.
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(path);
  });

  return router;
}
