import { AgendaQuerySchema, type AgendaResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { buildAgenda, type AgendaDeps } from './agenda.service.js';

/**
 * «Mi agenda» (Prompt 20) — GET /api/workspaces/:workspaceId/agenda, detrás de
 * requireWorkspaceAccess. SOLO lectura y solo Personal (capacidad `agenda`). Parámetros controlados
 * (`view`, `anchor`, `horizon`, `timezone`): ningún calendario, usuario ni workspace del cliente, y
 * nada de ids de eventos. No hay POST ni PATCH: los cambios van por PixelCommand.
 */
export function createAgendaRouter(deps: AgendaDeps): Router {
  const router = Router({ mergeParams: true });
  router.get('/', async (req, res) => {
    const workspace = getWorkspace(req);
    assertWorkspaceFeature(
      workspace,
      'agenda',
      '«Mi agenda» solo está disponible en tu Pixel Personal',
    );
    const body: AgendaResponse = {
      agenda: await buildAgenda(workspace, AgendaQuerySchema.parse(req.query), deps),
    };
    res.set('Cache-Control', 'no-store');
    res.json(body);
  });
  return router;
}
