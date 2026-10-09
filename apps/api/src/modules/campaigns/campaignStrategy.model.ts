import {
  CampaignStrategySchema,
  InsightTypeSchema,
  type CampaignPillar,
  type CampaignStrategy,
  type InsightType,
  type VisualDirection,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * CampaignStrategy: una VERSIÓN de la estrategia de una campaña. Nunca se sobrescribe: regenerar
 * crea la versión siguiente ({workspaceId, campaignId, version} único) y la campaña apunta a la
 * vigente. Toda consulta filtra por workspaceId (tenantScoped) y además por campaignId.
 */
export interface CampaignStrategyAttrs {
  workspaceId: Types.ObjectId;
  campaignId: Types.ObjectId;
  version: number;
  strategicProblem: string;
  strategicOpportunity: string;
  insight: string;
  insightType: InsightType;
  bigIdea: string;
  concept: string;
  campaignNarrative: string;
  keyMessage: string;
  supportingMessages: string[];
  valueProposition: string | null;
  callToAction: string | null;
  tone: string[];
  visualDirection: VisualDirection;
  channels: string[];
  contentPillars: CampaignPillar[];
  rationale: string;
  brandDnaVersion: number;
  generation: {
    provider: string;
    model: string;
    mode: 'ai' | 'demo';
    discardedDeliverables: number;
    discardedClaims: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignStrategyDocument = HydratedDocument<CampaignStrategyAttrs>;

const strings = { type: [String], default: [] };

const campaignStrategySchema = new Schema<CampaignStrategyAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    version: { type: Number, required: true, min: 1 },
    strategicProblem: { type: String, required: true },
    strategicOpportunity: { type: String, required: true },
    insight: { type: String, required: true },
    insightType: { type: String, enum: InsightTypeSchema.options, required: true },
    bigIdea: { type: String, required: true },
    concept: { type: String, required: true },
    campaignNarrative: { type: String, required: true },
    keyMessage: { type: String, required: true },
    supportingMessages: strings,
    valueProposition: { type: String, default: null },
    callToAction: { type: String, default: null },
    tone: strings,
    visualDirection: {
      mood: strings,
      colors: strings,
      materials: strings,
      composition: strings,
      photography: strings,
      motion: strings,
      avoid: strings,
    },
    channels: strings,
    contentPillars: {
      type: [{ _id: false, name: { type: String, required: true }, purpose: String }],
      default: [],
    },
    rationale: { type: String, required: true },
    brandDnaVersion: { type: Number, required: true },
    generation: {
      provider: { type: String, required: true },
      model: { type: String, required: true },
      mode: { type: String, enum: ['ai', 'demo'], required: true },
      discardedDeliverables: { type: Number, default: 0 },
      discardedClaims: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

campaignStrategySchema.index({ workspaceId: 1, campaignId: 1, version: 1 }, { unique: true });
campaignStrategySchema.plugin(tenantScoped, { key: 'workspaceId' });

export const CampaignStrategyModel = model<CampaignStrategyAttrs>(
  'CampaignStrategy',
  campaignStrategySchema,
  'campaign_strategies',
);

const list = (values: string[] | undefined) => [...(values ?? [])];

export function toCampaignStrategyDTO(doc: CampaignStrategyDocument): CampaignStrategy {
  const visual = doc.visualDirection;
  return CampaignStrategySchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    campaignId: doc.campaignId.toString(),
    version: doc.version,
    strategicProblem: doc.strategicProblem,
    strategicOpportunity: doc.strategicOpportunity,
    insight: doc.insight,
    insightType: doc.insightType,
    bigIdea: doc.bigIdea,
    concept: doc.concept,
    campaignNarrative: doc.campaignNarrative,
    keyMessage: doc.keyMessage,
    supportingMessages: list(doc.supportingMessages),
    valueProposition: doc.valueProposition ?? null,
    callToAction: doc.callToAction ?? null,
    tone: list(doc.tone),
    visualDirection: {
      mood: list(visual.mood),
      colors: list(visual.colors),
      materials: list(visual.materials),
      composition: list(visual.composition),
      photography: list(visual.photography),
      motion: list(visual.motion),
      avoid: list(visual.avoid),
    },
    channels: list(doc.channels),
    contentPillars: doc.contentPillars.map((pillar) => ({
      name: pillar.name,
      purpose: pillar.purpose ?? '',
    })),
    rationale: doc.rationale,
    brandDnaVersion: doc.brandDnaVersion,
    generation: {
      provider: doc.generation.provider,
      model: doc.generation.model,
      mode: doc.generation.mode,
      discardedDeliverables: doc.generation.discardedDeliverables ?? 0,
      discardedClaims: doc.generation.discardedClaims ?? 0,
    },
    createdAt: doc.createdAt.toISOString(),
  });
}
