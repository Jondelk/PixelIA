import {
  DailyBriefListQuerySchema,
  type DailyBriefListResponse,
  type DailyBriefResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  generateDailyBrief,
  getCurrentDailyBrief,
  getDailyBrief,
  listDailyBriefs,
  type DailyBriefDeps,
} from './dailyBrief.service.js';

/**
 * Módulo daily-director — montado en /api/workspaces/:workspaceId detrás de requireWorkspaceAccess.
 * El DailyBrief es un resultado derivado: no hay PATCH ni DELETE. Enterprise →
 * 400 feature_not_available (lo comprueba el servicio).
 */
export function createDailyBriefRouter(deps: DailyBriefDeps): Router {
  const router = Router({ mergeParams: true });

  /** Dirección vigente de hoy (día local del workspace). 404 daily_brief_not_generated si no hay. */
  router.get('/daily-brief', async (req, res) => {
    const body: DailyBriefResponse = await getCurrentDailyBrief(getWorkspace(req), deps);
    res.json(body);
  });

  /** Genera o regenera la dirección de hoy (nueva versión del día). */
  router.post('/daily-brief/generate', async (req, res) => {
    const body: DailyBriefResponse = await generateDailyBrief(getWorkspace(req), deps);
    res.status(201).json(body);
  });

  /** Historial (todas las versiones, el día más reciente primero). */
  router.get('/daily-briefs', async (req, res) => {
    const query = DailyBriefListQuerySchema.parse(req.query);
    const body: DailyBriefListResponse = await listDailyBriefs(getWorkspace(req), query);
    res.json(body);
  });

  router.get('/daily-briefs/:briefId', async (req, res) => {
    res.json({ brief: await getDailyBrief(getWorkspace(req), req.params.briefId) });
  });

  return router;
}
