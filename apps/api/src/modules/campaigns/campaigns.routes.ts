import {
  CampaignDeliverableListQuerySchema,
  CampaignListQuerySchema,
  CampaignStrategyQuerySchema,
  CreateCampaignSchema,
  GenerateCampaignSchema,
  RegenerateCampaignStrategySchema,
  UpdateCampaignDeliverableSchema,
  UpdateCampaignSchema,
  type AcceptCampaignDeliverableResponse,
  type CampaignDeliverableListResponse,
  type CampaignDeliverableResponse,
  type CampaignGenerationResponse,
  type CampaignListResponse,
  type CampaignResponse,
  type CampaignStrategyResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  acceptCampaignDeliverable,
  archiveCampaign,
  createCampaign,
  generateCampaign,
  getCampaign,
  getCampaignStrategy,
  listCampaignDeliverables,
  listCampaigns,
  regenerateCampaignStrategy,
  rejectCampaignDeliverable,
  updateCampaign,
  updateCampaignDeliverable,
  type CampaignDeps,
} from './campaigns.service.js';

/**
 * Módulo campaigns — /api/workspaces/:workspaceId/campaigns, detrás de requireWorkspaceAccess
 * (`req.workspace` es del usuario de la sesión). Solo Enterprise: el servicio comprueba la
 * capacidad `campaigns` (Personal → 400 feature_not_available). Los cuerpos son `strict`.
 */
export function createCampaignsRouter(deps: CampaignDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/generate', async (req, res) => {
    const input = GenerateCampaignSchema.parse(req.body);
    const body: CampaignGenerationResponse = await generateCampaign(getWorkspace(req), input, deps);
    res.status(201).json(body);
  });

  router.post('/', async (req, res) => {
    const input = CreateCampaignSchema.parse(req.body);
    const body: CampaignResponse = await createCampaign(getWorkspace(req), input);
    res.status(201).json(body);
  });

  router.get('/', async (req, res) => {
    const query = CampaignListQuerySchema.parse(req.query);
    const body: CampaignListResponse = await listCampaigns(getWorkspace(req), query);
    res.json(body);
  });

  router.get('/:campaignId', async (req, res) => {
    const body: CampaignResponse = await getCampaign(getWorkspace(req), req.params.campaignId);
    res.json(body);
  });

  router.patch('/:campaignId', async (req, res) => {
    const input = UpdateCampaignSchema.parse(req.body);
    const body: CampaignResponse = await updateCampaign(
      getWorkspace(req),
      req.params.campaignId,
      input,
    );
    res.json(body);
  });

  /** DELETE archiva (no elimina). */
  router.delete('/:campaignId', async (req, res) => {
    const body: CampaignResponse = await archiveCampaign(getWorkspace(req), req.params.campaignId);
    res.json(body);
  });

  router.get('/:campaignId/strategy', async (req, res) => {
    const { version } = CampaignStrategyQuerySchema.parse(req.query);
    const body: CampaignStrategyResponse = await getCampaignStrategy(
      getWorkspace(req),
      req.params.campaignId,
      version,
    );
    res.json(body);
  });

  router.post('/:campaignId/strategy/generate', async (req, res) => {
    const input = RegenerateCampaignStrategySchema.parse(req.body ?? {});
    const body: CampaignGenerationResponse = await regenerateCampaignStrategy(
      getWorkspace(req),
      req.params.campaignId,
      input,
      deps,
    );
    res.status(201).json(body);
  });

  router.get('/:campaignId/deliverables', async (req, res) => {
    const query = CampaignDeliverableListQuerySchema.parse(req.query);
    const body: CampaignDeliverableListResponse = await listCampaignDeliverables(
      getWorkspace(req),
      req.params.campaignId,
      query,
    );
    res.json(body);
  });

  router.patch('/:campaignId/deliverables/:deliverableId', async (req, res) => {
    const input = UpdateCampaignDeliverableSchema.parse(req.body);
    const body: CampaignDeliverableResponse = await updateCampaignDeliverable(
      getWorkspace(req),
      req.params.campaignId,
      req.params.deliverableId,
      input,
    );
    res.json(body);
  });

  router.post('/:campaignId/deliverables/:deliverableId/accept', async (req, res) => {
    const body: AcceptCampaignDeliverableResponse = await acceptCampaignDeliverable(
      getWorkspace(req),
      req.params.campaignId,
      req.params.deliverableId,
    );
    res.status(body.created ? 201 : 200).json(body);
  });

  router.post('/:campaignId/deliverables/:deliverableId/reject', async (req, res) => {
    const body: CampaignDeliverableResponse = await rejectCampaignDeliverable(
      getWorkspace(req),
      req.params.campaignId,
      req.params.deliverableId,
    );
    res.json(body);
  });

  return router;
}
