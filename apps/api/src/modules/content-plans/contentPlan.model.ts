import {
  ContentPlanContextTypeSchema,
  ContentPlanGeneratedBySchema,
  ContentPlanSchema,
  ContentPlanStatusSchema,
  ContentPlatformSchema,
  type ContentPillar,
  type ContentPlan,
  type ContentPlanContextType,
  type ContentPlanGeneratedBy,
  type ContentPlanGeneration,
  type ContentPlanItemCounts,
  type ContentPlanStatus,
  type ContentPlatform,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * ContentPlan: estrategia de contenido de un periodo (máx. 30 días). Recurso del Workspace
 * (Personal o Enterprise): toda consulta filtra por workspaceId (tenantScoped). El periodo se
 * guarda como días locales "YYYY-MM-DD" (lo que eligió la persona), no como instantes.
 *
 * `contextType` NO tiene valor por defecto a propósito: Mongoose aplica los defaults al leer, y un
 * plan anterior sin el campo aparecería como de otro tipo. Los documentos anteriores lo reciben de
 * la migración (contentPlan.migration.ts) o, al leerlos, del tipo de su workspace (inmutable).
 */
export interface ContentPlanAttrs {
  workspaceId: Types.ObjectId;
  /** Ausente solo en planes anteriores al Prompt 14 aún sin migrar. */
  contextType?: ContentPlanContextType;
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
  brandDnaVersion: number | null;
  campaignId: Types.ObjectId | null;
  campaignStrategyVersion: number | null;
  editorialObjective: string | null;
  campaignAlignment: string | null;
  distributionRationale: string | null;
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
    memoryKeys: { type: [String], default: undefined },
  },
  { _id: false },
);

const contentPlanSchema = new Schema<ContentPlanAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    contextType: { type: String, enum: ContentPlanContextTypeSchema.options },
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
    brandDnaVersion: { type: Number, default: null, min: 1 },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    campaignStrategyVersion: { type: Number, default: null, min: 1 },
    editorialObjective: { type: String, default: null, maxlength: 400 },
    campaignAlignment: { type: String, default: null, maxlength: 800 },
    distributionRationale: { type: String, default: null, maxlength: 600 },
    generation: { type: generationSchema, default: null },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo del compuesto.
contentPlanSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
// Planes de una campaña (detalle de campaña y filtro ?campaignId=). Sin índice por contextType:
// todos los planes de un workspace tienen el mismo (el de su workspace).
contentPlanSchema.index({ workspaceId: 1, campaignId: 1, createdAt: -1 });
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

/**
 * `workspaceType`: tipo del workspace autorizado del que se leyó el plan. Solo se usa si el plan aún
 * no tiene `contextType` (anterior al Prompt 14): es seguro porque el tipo de un workspace no cambia.
 */
export function toContentPlanDTO(
  doc: ContentPlanDocument,
  itemCounts: ContentPlanItemCounts = EMPTY_ITEM_COUNTS,
  workspaceType?: ContentPlanContextType,
): ContentPlan {
  const generation = doc.generation;
  const contextType = doc.contextType ?? workspaceType;
  if (!contextType) throw new Error(`ContentPlan ${doc._id.toString()} sin contextType`);
  return ContentPlanSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contextType,
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
    brandDnaVersion: doc.brandDnaVersion ?? null,
    campaignId: doc.campaignId?.toString() ?? null,
    campaignStrategyVersion: doc.campaignStrategyVersion ?? null,
    editorialObjective: doc.editorialObjective ?? null,
    campaignAlignment: doc.campaignAlignment ?? null,
    distributionRationale: doc.distributionRationale ?? null,
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
          memoryKeys: generation.memoryKeys ?? [],
        }
      : null,
    itemCounts,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
