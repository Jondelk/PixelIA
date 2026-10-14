import {
  AcceptCampaignDeliverableResponseSchema,
  CampaignDeliverableListResponseSchema,
  CampaignDeliverableResponseSchema,
  CampaignGenerationResponseSchema,
  CampaignListResponseSchema,
  CampaignResponseSchema,
  CampaignStrategyResponseSchema,
  type AcceptCampaignDeliverableResponse,
  type Campaign,
  type CampaignDeliverable,
  type CampaignGenerationResponse,
  type CampaignListResponse,
  type CampaignStatus,
  type CampaignStrategyResponse,
  type CreateCampaignInput,
  type GenerateCampaignInput,
  type RegenerateCampaignStrategyInput,
  type UpdateCampaignDeliverableInput,
  type UpdateCampaignInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { queryString } from '../../lib/query';

/** Campaign Manager: /api/workspaces/:workspaceId/campaigns (solo Pixels de empresa). */

const campaignsPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/campaigns`;
const campaignPath = (workspaceId: string, campaignId: string) =>
  `${campaignsPath(workspaceId)}/${encodeURIComponent(campaignId)}`;
const deliverablePath = (workspaceId: string, campaignId: string, deliverableId: string) =>
  `${campaignPath(workspaceId, campaignId)}/deliverables/${encodeURIComponent(deliverableId)}`;

export function listCampaigns(
  workspaceId: string,
  filters: { status?: readonly CampaignStatus[]; limit?: number } = {},
  signal?: AbortSignal,
): Promise<CampaignListResponse> {
  return apiRequest(
    `${campaignsPath(workspaceId)}${queryString({ ...filters })}`,
    CampaignListResponseSchema,
    { signal },
  );
}

export async function getCampaign(
  workspaceId: string,
  campaignId: string,
  signal?: AbortSignal,
): Promise<Campaign> {
  return (
    await apiRequest(campaignPath(workspaceId, campaignId), CampaignResponseSchema, { signal })
  ).campaign;
}

export async function createCampaign(
  workspaceId: string,
  input: CreateCampaignInput,
): Promise<Campaign> {
  return (
    await apiRequest(campaignsPath(workspaceId), CampaignResponseSchema, {
      method: 'POST',
      body: input,
    })
  ).campaign;
}

export async function updateCampaign(
  workspaceId: string,
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  return (
    await apiRequest(campaignPath(workspaceId, campaignId), CampaignResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  ).campaign;
}

/** DELETE archiva la campaña (su estrategia, piezas y operaciones se conservan). */
export async function archiveCampaign(workspaceId: string, campaignId: string): Promise<Campaign> {
  return (
    await apiRequest(campaignPath(workspaceId, campaignId), CampaignResponseSchema, {
      method: 'DELETE',
    })
  ).campaign;
}

/** Pixel construye la campaña (estrategia v1 + piezas) desde el BrandDNA. */
export function generateCampaign(
  workspaceId: string,
  input: GenerateCampaignInput,
): Promise<CampaignGenerationResponse> {
  return apiRequest(`${campaignsPath(workspaceId)}/generate`, CampaignGenerationResponseSchema, {
    method: 'POST',
    body: input,
  });
}

/** Nueva versión de la estrategia (las anteriores se conservan). */
export function regenerateStrategy(
  workspaceId: string,
  campaignId: string,
  input: RegenerateCampaignStrategyInput = {},
): Promise<CampaignGenerationResponse> {
  return apiRequest(
    `${campaignPath(workspaceId, campaignId)}/strategy/generate`,
    CampaignGenerationResponseSchema,
    { method: 'POST', body: input },
  );
}

export function getStrategy(
  workspaceId: string,
  campaignId: string,
  version?: number,
  signal?: AbortSignal,
): Promise<CampaignStrategyResponse> {
  return apiRequest(
    `${campaignPath(workspaceId, campaignId)}/strategy${queryString({ version })}`,
    CampaignStrategyResponseSchema,
    { signal },
  );
}

export async function listDeliverables(
  workspaceId: string,
  campaignId: string,
  signal?: AbortSignal,
): Promise<CampaignDeliverable[]> {
  return (
    await apiRequest(
      `${campaignPath(workspaceId, campaignId)}/deliverables`,
      CampaignDeliverableListResponseSchema,
      { signal },
    )
  ).deliverables;
}

export async function updateDeliverable(
  workspaceId: string,
  campaignId: string,
  deliverableId: string,
  input: UpdateCampaignDeliverableInput,
): Promise<CampaignDeliverable> {
  return (
    await apiRequest(
      deliverablePath(workspaceId, campaignId, deliverableId),
      CampaignDeliverableResponseSchema,
      { method: 'PATCH', body: input },
    )
  ).deliverable;
}

/** Aceptar convierte la pieza (contenido → Contenido; producción → Proyecto). Idempotente. */
export function acceptDeliverable(
  workspaceId: string,
  campaignId: string,
  deliverableId: string,
): Promise<AcceptCampaignDeliverableResponse> {
  return apiRequest(
    `${deliverablePath(workspaceId, campaignId, deliverableId)}/accept`,
    AcceptCampaignDeliverableResponseSchema,
    { method: 'POST' },
  );
}

export async function rejectDeliverable(
  workspaceId: string,
  campaignId: string,
  deliverableId: string,
): Promise<CampaignDeliverable> {
  return (
    await apiRequest(
      `${deliverablePath(workspaceId, campaignId, deliverableId)}/reject`,
      CampaignDeliverableResponseSchema,
      { method: 'POST' },
    )
  ).deliverable;
}
