import {
  CampaignDeliverableSchema,
  CampaignDeliverableStatusSchema,
  CampaignDeliverableTypeSchema,
  type CampaignDeliverable,
  type CampaignDeliverableStatus,
  type CampaignDeliverableType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * CampaignDeliverable: lo que la campaña NECESITA. No es una pieza en producción: al aceptarla se
 * crea, una sola vez, un ContentItem o un Project del mismo workspace (convertedContentItemId /
 * convertedProjectId, fijados con una reserva atómica). Toda consulta filtra por workspaceId
 * (tenantScoped) y además por campaignId.
 */
export interface CampaignDeliverableAttrs {
  workspaceId: Types.ObjectId;
  campaignId: Types.ObjectId;
  strategyVersion: number | null;
  title: string;
  description: string | null;
  type: CampaignDeliverableType;
  platform: string | null;
  format: string | null;
  objective: string | null;
  rationale: string | null;
  status: CampaignDeliverableStatus;
  position: number;
  convertedProjectId: Types.ObjectId | null;
  convertedContentItemId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignDeliverableDocument = HydratedDocument<CampaignDeliverableAttrs>;

const campaignDeliverableSchema = new Schema<CampaignDeliverableAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    strategyVersion: { type: Number, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 600 },
    type: { type: String, enum: CampaignDeliverableTypeSchema.options, required: true },
    platform: { type: String, default: null, maxlength: 60 },
    format: { type: String, default: null, maxlength: 60 },
    objective: { type: String, default: null, maxlength: 300 },
    rationale: { type: String, default: null, maxlength: 500 },
    status: {
      type: String,
      enum: CampaignDeliverableStatusSchema.options,
      required: true,
      default: 'proposed',
    },
    position: { type: Number, required: true, default: 0 },
    convertedProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    convertedContentItemId: { type: Schema.Types.ObjectId, ref: 'ContentItem', default: null },
  },
  { timestamps: true },
);

campaignDeliverableSchema.index({ workspaceId: 1, campaignId: 1, strategyVersion: 1, position: 1 });
campaignDeliverableSchema.index({ workspaceId: 1, status: 1 });
campaignDeliverableSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const CampaignDeliverableModel = model<CampaignDeliverableAttrs>(
  'CampaignDeliverable',
  campaignDeliverableSchema,
  'campaign_deliverables',
);

export function toCampaignDeliverableDTO(doc: CampaignDeliverableDocument): CampaignDeliverable {
  return CampaignDeliverableSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    campaignId: doc.campaignId.toString(),
    strategyVersion: doc.strategyVersion ?? null,
    title: doc.title,
    description: doc.description ?? null,
    type: doc.type,
    platform: doc.platform ?? null,
    format: doc.format ?? null,
    objective: doc.objective ?? null,
    rationale: doc.rationale ?? null,
    status: doc.status,
    position: doc.position,
    convertedProjectId: doc.convertedProjectId?.toString() ?? null,
    convertedContentItemId: doc.convertedContentItemId?.toString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
