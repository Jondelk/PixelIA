import {
  ContentPlanListQuerySchema,
  CreateContentPlanSchema,
  GenerateContentPlanSchema,
  RejectContentPlanItemSchema,
  UpdateContentPlanItemSchema,
  UpdateContentPlanSchema,
  type AcceptContentPlanItemResponse,
  type ContentPlanItemResponse,
  type ContentPlanListResponse,
  type ContentPlanResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  acceptContentPlanItem,
  archiveContentPlan,
  createContentPlan,
  generateContentPlan,
  getContentPlan,
  listContentPlans,
  rejectContentPlanItem,
  updateContentPlan,
  updateContentPlanItem,
  type ContentPlanDeps,
} from './contentPlans.service.js';

/**
 * Módulo content-plans — /api/workspaces/:workspaceId/content-plans, detrás de
 * requireWorkspaceAccess (`req.workspace` es del usuario de la sesión). Los planes son recursos
 * del workspace; generar con Pixel exige un workspace personal (lo comprueba el servicio).
 */
export function createContentPlansRouter(deps: ContentPlanDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/generate', async (req, res) => {
    const input = GenerateContentPlanSchema.parse(req.body);
    const body: ContentPlanResponse = await generateContentPlan(getWorkspace(req), input, deps);
    res.status(201).json(body);
  });

  router.post('/', async (req, res) => {
    const input = CreateContentPlanSchema.parse(req.body);
    const body: ContentPlanResponse = await createContentPlan(getWorkspace(req), input);
    res.status(201).json(body);
  });

  router.get('/', async (req, res) => {
    const query = ContentPlanListQuerySchema.parse(req.query);
    const body: ContentPlanListResponse = await listContentPlans(getWorkspace(req), query);
    res.json(body);
  });

  router.get('/:planId', async (req, res) => {
    const body: ContentPlanResponse = await getContentPlan(getWorkspace(req), req.params.planId);
    res.json(body);
  });

  router.patch('/:planId', async (req, res) => {
    const input = UpdateContentPlanSchema.parse(req.body);
    const body: ContentPlanResponse = await updateContentPlan(
      getWorkspace(req),
      req.params.planId,
      input,
    );
    res.json(body);
  });

  /** Archiva el plan (sus propuestas se conservan). */
  router.delete('/:planId', async (req, res) => {
    const body: ContentPlanResponse = await archiveContentPlan(
      getWorkspace(req),
      req.params.planId,
    );
    res.json(body);
  });

  router.patch('/:planId/items/:itemId', async (req, res) => {
    const input = UpdateContentPlanItemSchema.parse(req.body);
    const body: ContentPlanItemResponse = await updateContentPlanItem(
      getWorkspace(req),
      req.params.planId,
      req.params.itemId,
      input,
    );
    res.json(body);
  });

  /** Convierte la propuesta en un ContentItem. Idempotente: 201 la primera vez, 200 después. */
  router.post('/:planId/items/:itemId/accept', async (req, res) => {
    const body: AcceptContentPlanItemResponse = await acceptContentPlanItem(
      getWorkspace(req),
      req.params.planId,
      req.params.itemId,
    );
    res.status(body.created ? 201 : 200).json(body);
  });

  router.post('/:planId/items/:itemId/reject', async (req, res) => {
    const { reason } = RejectContentPlanItemSchema.parse(req.body ?? {});
    const body: ContentPlanItemResponse = await rejectContentPlanItem(
      getWorkspace(req),
      req.params.planId,
      req.params.itemId,
      reason,
    );
    res.json(body);
  });

  return router;
}
