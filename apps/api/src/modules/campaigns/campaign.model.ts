import {
  CampaignGeneratedBySchema,
  CampaignSchema,
  CampaignStatusSchema,
  CampaignTypeSchema,
  type Campaign,
  type CampaignGeneratedBy,
  type CampaignStats,
  type CampaignStatus,
  type CampaignType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * Campaign: entidad ESTRATÉGICA del workspace (Enterprise). Guarda el brief y apunta a su
 * estrategia vigente (CampaignStrategy, versionada aparte). No es un Project: la ejecución vive en
 * las Operations con `campaignId`. Toda consulta filtra por workspaceId (tenantScoped).
 */
export interface CampaignAttrs {
  workspaceId: Types.ObjectId;
  name: string;
  description: string | null;
  status: CampaignStatus;
  objective: string;
  campaignType: CampaignType | null;
  productOrService: string | null;
  targetAudience: string[];
  keyMessage: string | null;
  startDate: Date | null;
  endDate: Date | null;
  problem: string | null;
  desiredOutcome: string | null;
  channels: string[];
  constraints: string[];
  mandatoryElements: string[];
  references: string[];
  brandDnaVersion: number | null;
  generatedBy: CampaignGeneratedBy;
  currentStrategyVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignDocument = HydratedDocument<CampaignAttrs>;

const campaignSchema = new Schema<CampaignAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, default: null, maxlength: 2000 },
    status: { type: String, enum: CampaignStatusSchema.options, required: true, default: 'draft' },
    objective: { type: String, required: true, trim: true, maxlength: 500 },
    campaignType: { type: String, enum: [...CampaignTypeSchema.options, null], default: null },
    productOrService: { type: String, default: null, maxlength: 200 },
    targetAudience: { type: [String], default: [] },
    keyMessage: { type: String, default: null, maxlength: 200 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    problem: { type: String, default: null, maxlength: 1000 },
    desiredOutcome: { type: String, default: null, maxlength: 1000 },
    channels: { type: [String], default: [] },
    constraints: { type: [String], default: [] },
    mandatoryElements: { type: [String], default: [] },
    references: { type: [String], default: [] },
    brandDnaVersion: { type: Number, default: null },
    generatedBy: { type: String, enum: CampaignGeneratedBySchema.options, required: true },
    currentStrategyVersion: { type: Number, default: null },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo de los compuestos.
campaignSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
campaignSchema.index({ workspaceId: 1, startDate: 1 });
campaignSchema.index({ workspaceId: 1, endDate: 1 });
campaignSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const CampaignModel = model<CampaignAttrs>('Campaign', campaignSchema, 'campaigns');

export const EMPTY_CAMPAIGN_STATS: CampaignStats = {
  deliverables: 0,
  proposedDeliverables: 0,
  convertedDeliverables: 0,
  projects: 0,
  contentItems: 0,
};

export function toCampaignDTO(
  doc: CampaignDocument,
  stats: CampaignStats = EMPTY_CAMPAIGN_STATS,
): Campaign {
  return CampaignSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    status: doc.status,
    objective: doc.objective,
    campaignType: doc.campaignType ?? null,
    productOrService: doc.productOrService ?? null,
    targetAudience: [...doc.targetAudience],
    keyMessage: doc.keyMessage ?? null,
    startDate: doc.startDate?.toISOString() ?? null,
    endDate: doc.endDate?.toISOString() ?? null,
    problem: doc.problem ?? null,
    desiredOutcome: doc.desiredOutcome ?? null,
    channels: [...doc.channels],
    constraints: [...doc.constraints],
    mandatoryElements: [...doc.mandatoryElements],
    references: [...doc.references],
    brandDnaVersion: doc.brandDnaVersion ?? null,
    generatedBy: doc.generatedBy,
    currentStrategyVersion: doc.currentStrategyVersion ?? null,
    stats,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
