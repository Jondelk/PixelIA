import {
  ContentPlanGeneratedBySchema,
  ContentPlanSchema,
  ContentPlanStatusSchema,
  ContentPlatformSchema,
  type ContentPillar,
  type ContentPlan,
  type ContentPlanGeneratedBy,
  type ContentPlanGeneration,
  type ContentPlanItemCounts,
  type ContentPlanStatus,
  type ContentPlatform,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * ContentPlan: estrategia de contenido de un periodo (máx. 30 días). Recurso del Workspace:
 * toda consulta filtra por workspaceId (tenantScoped). El periodo se guarda como días locales
 * "YYYY-MM-DD" (lo que eligió la persona), no como instantes.
 */
export interface ContentPlanAttrs {
  workspaceId: Types.ObjectId;
  name: string;
  objective: string | null;
  period: { startDate: string; endDate: string };
  strategySummary: string | null;
  pillars: ContentPillar[];
  targetAudience: string[];
  platforms: ContentPlatform[];
  status: ContentPlanStatus;
  generatedBy: ContentPlanGeneratedBy;
  personalDnaVersion: number | null;
  generation:
    | (Omit<ContentPlanGeneration, 'regeneratedFromPlanId'> & {
        regeneratedFromPlanId: Types.ObjectId | null;
      })
    | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentPlanDocument = HydratedDocument<ContentPlanAttrs>;

const generationSchema = new Schema(
  {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    mode: { type: String, enum: ['ai', 'demo'], required: true },
    discardedItems: { type: Number, required: true, min: 0 },
    frequencyPerWeek: { type: Number, required: true, min: 1 },
    frequencySource: { type: String, enum: ['request', 'personal_dna', 'default'], required: true },
    requestedGoal: { type: String, default: null },
    regeneratedFromPlanId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const contentPlanSchema = new Schema<ContentPlanAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    objective: { type: String, default: null, maxlength: 500 },
    period: {
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
    },
    strategySummary: { type: String, default: null, maxlength: 2000 },
    pillars: {
      type: [{ _id: false, name: String, rationale: String }],
      default: [],
    },
    targetAudience: { type: [String], default: [] },
    platforms: { type: [{ type: String, enum: ContentPlatformSchema.options }], default: [] },
    status: {
      type: String,
      enum: ContentPlanStatusSchema.options,
      required: true,
      default: 'draft',
    },
    generatedBy: { type: String, enum: ContentPlanGeneratedBySchema.options, required: true },
    personalDnaVersion: { type: Number, default: null, min: 1 },
    generation: { type: generationSchema, default: null },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo del compuesto.
contentPlanSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
contentPlanSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const ContentPlanModel = model<ContentPlanAttrs>(
  'ContentPlan',
  contentPlanSchema,
  'content_plans',
);

export const EMPTY_ITEM_COUNTS: ContentPlanItemCounts = {
  proposed: 0,
  accepted: 0,
  rejected: 0,
  converted: 0,
};

export function toContentPlanDTO(
  doc: ContentPlanDocument,
  itemCounts: ContentPlanItemCounts = EMPTY_ITEM_COUNTS,
): ContentPlan {
  const generation = doc.generation;
  return ContentPlanSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    objective: doc.objective ?? null,
    period: { startDate: doc.period.startDate, endDate: doc.period.endDate },
    strategySummary: doc.strategySummary ?? null,
    pillars: doc.pillars.map((pillar) => ({ name: pillar.name, rationale: pillar.rationale })),
    targetAudience: [...doc.targetAudience],
    platforms: [...doc.platforms],
    status: doc.status,
    generatedBy: doc.generatedBy,
    personalDnaVersion: doc.personalDnaVersion ?? null,
    generation: generation
      ? {
          provider: generation.provider,
          model: generation.model,
          mode: generation.mode,
          discardedItems: generation.discardedItems,
          frequencyPerWeek: generation.frequencyPerWeek,
          frequencySource: generation.frequencySource,
          requestedGoal: generation.requestedGoal ?? null,
          regeneratedFromPlanId: generation.regeneratedFromPlanId?.toString() ?? null,
        }
      : null,
    itemCounts,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
