import type { ContentPlatform, PixelCommandIntent } from '@pixel/contracts';
import { AppError } from '../../lib/errors.js';
import { CampaignModel } from '../campaigns/campaign.model.js';
import { loadBrandContext } from '../campaigns/campaigns.service.js';
import { platformFromText } from '../content-plans/contentPlanning.grounding.js';
import { PERSONAL_CONTEXT_NOT_CONFIGURED } from '../conversations/context/personalContext.builder.js';
import { ProjectModel } from '../operations/project.model.js';
import { loadPersonalDna } from '../personal/personal.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { hasWorkspaceFeature } from '../workspaces/workspaceFeatures.js';

/*
 * PixelContextResolver (docs/PIXEL-COMMAND.md §3): lo que Pixel YA sabe, cargado solo para la
 * intención y SIEMPRE del workspace autorizado (nunca de un id que mande el cliente o el modelo).
 * Sin ADN no hay nada que proponer: 409 con el mismo `reason` que el chat y el planner.
 */

export interface KnownCampaign {
  id: string;
  name: string;
  productOrService: string | null;
  objective: string;
  channels: string[];
  status: string;
  hasStrategy: boolean;
  updatedAt: Date;
}

export interface KnownProject {
  id: string;
  name: string;
  status: string;
}

export interface PixelKnownContext {
  workspaceType: 'personal' | 'enterprise';
  /** Marca (Enterprise) o persona (Personal). */
  ownerName: string;
  /** Plataformas declaradas en el PersonalDNA (Enterprise: el BrandDNA no declara plataformas). */
  dnaPlatforms: ContentPlatform[];
  campaigns: KnownCampaign[];
  projects: KnownProject[];
}

export const PIXEL_CONTEXT_LIMITS = { campaigns: 20, projects: 30 } as const;

const NEEDS_CAMPAIGNS: PixelCommandIntent[] = [
  'plan_content',
  'work_status',
  'create_content',
  'manage_memory',
];
const NEEDS_PROJECTS: PixelCommandIntent[] = ['organize_project', 'create_tasks'];

export async function resolvePixelContext(
  workspace: WorkspaceDocument,
  intent: PixelCommandIntent,
): Promise<PixelKnownContext> {
  let ownerName: string;
  let dnaPlatforms: ContentPlatform[] = [];
  if (workspace.type === 'enterprise') {
    const { company } = await loadBrandContext(workspace);
    ownerName = company.name;
  } else {
    const { profile, personalDna } = await loadPersonalDna(workspace);
    if (!profile || !personalDna) {
      throw new AppError(409, 'CONFLICT', PERSONAL_CONTEXT_NOT_CONFIGURED, {
        reason: 'personal_context_not_configured',
      });
    }
    ownerName = personalDna.identity.name || workspace.name;
    dnaPlatforms = [
      ...new Set(
        personalDna.contentIdentity.platforms
          .map(platformFromText)
          .filter((platform) => platform !== 'other'),
      ),
    ];
  }

  const [campaigns, projects] = await Promise.all([
    NEEDS_CAMPAIGNS.includes(intent) && hasWorkspaceFeature(workspace, 'campaigns')
      ? CampaignModel.find({ workspaceId: workspace._id, status: { $ne: 'archived' } })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(PIXEL_CONTEXT_LIMITS.campaigns)
          .select({
            name: 1,
            productOrService: 1,
            objective: 1,
            channels: 1,
            status: 1,
            currentStrategyVersion: 1,
            updatedAt: 1,
          })
          .lean()
      : [],
    NEEDS_PROJECTS.includes(intent)
      ? ProjectModel.find({ workspaceId: workspace._id, status: { $in: ['active', 'planned'] } })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(PIXEL_CONTEXT_LIMITS.projects)
          .select({ name: 1, status: 1 })
          .lean()
      : [],
  ]);

  return {
    workspaceType: workspace.type,
    ownerName,
    dnaPlatforms,
    campaigns: campaigns.map((campaign) => ({
      id: campaign._id.toString(),
      name: campaign.name,
      productOrService: campaign.productOrService ?? null,
      objective: campaign.objective,
      channels: campaign.channels ?? [],
      status: campaign.status,
      hasStrategy: Boolean(campaign.currentStrategyVersion),
      updatedAt: campaign.updatedAt,
    })),
    projects: projects.map((project) => ({
      id: project._id.toString(),
      name: project.name,
      status: project.status,
    })),
  };
}
