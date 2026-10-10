import { createHash } from 'node:crypto';
import type {
  CampaignStrategy,
  ContentItem,
  ContentPlanItem,
  GuardianResourceType,
} from '@pixel/contracts';
import { getCampaign, getCampaignStrategy } from '../campaigns/campaigns.service.js';
import { getContentPlan } from '../content-plans/contentPlans.service.js';
import {
  ContentPlanItemModel,
  toContentPlanItemDTO,
} from '../content-plans/contentPlanItem.model.js';
import { getContentItem } from '../operations/content.service.js';
import { resourceId } from '../operations/operations.scope.js';
import { notFound } from '../../lib/errors.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { GuardianPiece, GuardianResourceSnapshot, GuardianText } from './guardian.types.js';

/*
 * Instantánea de lo que se revisa (docs/BRAND-GUARDIAN.md §3). Se carga SIEMPRE con los servicios
 * existentes y el workspace autorizado: un recurso de otro workspace (aunque sea del mismo dueño)
 * responde 404 como en el resto de la API. Cada texto recibe una referencia RESOURCE_TEXT_n y, si es
 * editable, el campo y el recurso al que pertenece (para aplicar una corrección después).
 */

export interface LoadedResource {
  snapshot: GuardianResourceSnapshot;
  resourceId: string | null;
  campaign: { id: string; name: string } | null;
  strategy: CampaignStrategy | null;
}

export const GUARDIAN_NOT_FOUND = 'Recurso no encontrado';

function textBuilder() {
  const texts: GuardianText[] = [];
  return {
    texts,
    add(
      label: string,
      text: string | null | undefined,
      role: GuardianText['role'],
      field: string | null = null,
      targetId: string | null = null,
    ): string | null {
      const value = text?.trim();
      if (!value) return null;
      const ref = `RESOURCE_TEXT_${texts.length + 1}`;
      texts.push({ ref, label, text: value, role, field, targetId });
      return ref;
    },
  };
}

async function campaignContext(
  workspace: WorkspaceDocument,
  campaignId: string | null,
  version?: number | null,
): Promise<Pick<LoadedResource, 'campaign' | 'strategy'>> {
  if (!campaignId) return { campaign: null, strategy: null };
  const { campaign } = await getCampaign(workspace, campaignId);
  const { strategy } = await getCampaignStrategy(workspace, campaignId, version ?? undefined);
  return { campaign: { id: campaign.id, name: campaign.name }, strategy };
}

function addItem(
  builder: ReturnType<typeof textBuilder>,
  item: ContentPlanItem | ContentItem,
  prefix: string,
  kind: 'plan_item' | 'content_item',
): GuardianPiece {
  const refs = [
    builder.add(`${prefix}Título`, item.title, 'title', 'title', item.id),
    builder.add(`${prefix}Concepto`, item.concept, 'concept', 'concept', item.id),
    builder.add(`${prefix}Hook`, item.hook, 'hook', 'hook', item.id),
    builder.add(`${prefix}Objetivo`, item.objective, 'objective', 'objective', item.id),
    ...(kind === 'plan_item'
      ? [
          builder.add(`${prefix}Mensaje`, (item as ContentPlanItem).strategicMessage, 'message'),
          builder.add(
            `${prefix}Ángulo sugerido`,
            (item as ContentPlanItem).suggestedAngle,
            'other',
            'suggestedAngle',
            item.id,
          ),
        ]
      : [
          builder.add(
            `${prefix}Caption`,
            (item as ContentItem).caption,
            'copy',
            'caption',
            item.id,
          ),
          builder.add(`${prefix}Guion`, (item as ContentItem).script, 'copy', 'script', item.id),
        ]),
  ].filter((ref): ref is string => ref !== null);
  return {
    label: `${prefix.replace(/ · $/, '') || 'Pieza'} «${item.title}»`,
    platform: item.platform ?? null,
    format: item.format ?? null,
    pillar: kind === 'plan_item' ? ((item as ContentPlanItem).pillar ?? null) : null,
    textRefs: refs,
  };
}

const latest = (dates: (string | null | undefined)[]) =>
  dates.reduce<Date | null>((max, value) => {
    if (!value) return max;
    const date = new Date(value);
    return !max || date > max ? date : max;
  }, null);

export async function loadGuardianResource(
  workspace: WorkspaceDocument,
  resourceType: Exclude<GuardianResourceType, 'pixel_proposal'>,
  rawId: string | undefined,
  content: string | undefined,
): Promise<LoadedResource> {
  const builder = textBuilder();
  switch (resourceType) {
    case 'copy': {
      builder.add('Texto', content, 'copy');
      return {
        snapshot: {
          label: 'Texto pegado',
          texts: builder.texts,
          visualDirection: null,
          pieces: [],
          updatedAt: null,
        },
        resourceId: null,
        campaign: null,
        strategy: null,
      };
    }
    case 'campaign':
    case 'campaign_strategy': {
      const { campaign } = await getCampaign(workspace, rawId);
      const { strategy } = await getCampaignStrategy(workspace, campaign.id, undefined);
      builder.add('Nombre', campaign.name, 'title');
      builder.add('Objetivo', campaign.objective, 'objective');
      if (strategy) {
        builder.add('Concepto', strategy.concept, 'concept');
        builder.add('Big idea', strategy.bigIdea, 'concept');
        builder.add('Mensaje principal', strategy.keyMessage, 'message');
        strategy.supportingMessages.forEach((message, index) =>
          builder.add(`Mensaje secundario ${index + 1}`, message, 'message'),
        );
        builder.add('Narrativa', strategy.campaignNarrative, 'other');
        builder.add('Propuesta de valor', strategy.valueProposition, 'message');
        builder.add('Llamada a la acción', strategy.callToAction, 'cta');
        strategy.contentPillars.forEach((pillar) =>
          builder.add(`Pilar «${pillar.name}»`, pillar.purpose, 'concept'),
        );
      } else {
        builder.add('Mensaje principal', campaign.keyMessage, 'message');
      }
      return {
        snapshot: {
          label: campaign.name,
          texts: builder.texts,
          visualDirection: strategy?.visualDirection ?? null,
          pieces: [],
          updatedAt: latest([campaign.updatedAt, strategy?.createdAt]),
        },
        resourceId: campaign.id,
        // La propia estrategia no se revisa "contra sí misma": la alineación aplica al contenido.
        campaign: { id: campaign.id, name: campaign.name },
        strategy,
      };
    }
    case 'content_plan': {
      const { plan, items } = await getContentPlan(workspace, rawId);
      builder.add('Estrategia editorial', plan.strategySummary, 'concept');
      builder.add('Qué vamos a comunicar', plan.editorialObjective, 'objective');
      const pieces = items
        .filter((item) => item.status !== 'rejected')
        .map((item, index) => addItem(builder, item, `Pieza ${index + 1} · `, 'plan_item'));
      const context = await campaignContext(
        workspace,
        plan.campaignId,
        plan.campaignStrategyVersion,
      );
      return {
        snapshot: {
          label: plan.name,
          texts: builder.texts,
          visualDirection: null,
          pieces,
          updatedAt: latest([plan.updatedAt, ...items.map((item) => item.updatedAt)]),
        },
        resourceId: plan.id,
        ...context,
      };
    }
    case 'content_plan_item': {
      const doc = await ContentPlanItemModel.findOne({
        _id: resourceId(rawId, GUARDIAN_NOT_FOUND),
        workspaceId: workspace._id,
      });
      if (!doc) throw notFound(GUARDIAN_NOT_FOUND);
      const item = toContentPlanItemDTO(doc);
      const piece = addItem(builder, item, '', 'plan_item');
      const { plan } = await getContentPlan(workspace, item.contentPlanId);
      const context = await campaignContext(
        workspace,
        plan.campaignId,
        plan.campaignStrategyVersion,
      );
      return {
        snapshot: {
          label: item.title,
          texts: builder.texts,
          visualDirection: null,
          pieces: [piece],
          updatedAt: new Date(item.updatedAt),
        },
        resourceId: item.id,
        ...context,
      };
    }
    case 'content_item': {
      const item = await getContentItem(workspace, rawId);
      const piece = addItem(builder, item, '', 'content_item');
      const context = await campaignContext(workspace, item.campaignId);
      return {
        snapshot: {
          label: item.title,
          texts: builder.texts,
          visualDirection: null,
          pieces: [piece],
          updatedAt: new Date(item.updatedAt),
        },
        resourceId: item.id,
        ...context,
      };
    }
  }
}

export function snapshotHash(snapshot: GuardianResourceSnapshot, userSupplied: string[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        texts: snapshot.texts.map((text) => [text.label, text.text]),
        visual: snapshot.visualDirection,
        userSupplied,
      }),
    )
    .digest('hex')
    .slice(0, 32);
}
