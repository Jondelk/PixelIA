import {
  ContentAngleSchema,
  ContentFormatSchema,
  ContentPlanItemSchema,
  ContentPlanItemStatusSchema,
  ContentPlatformSchema,
  type ContentAngle,
  type ContentFormat,
  type ContentPlanItem,
  type ContentPlanItemStatus,
  type ContentPlatform,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * ContentPlanItem: una PROPUESTA estratégica de un ContentPlan. No es una pieza en producción:
 * solo al aceptarla se crea un ContentItem (convertedContentItemId). Recurso del Workspace:
 * toda consulta filtra por workspaceId (tenantScoped) y además por su contentPlanId.
 */
export interface ContentPlanItemAttrs {
  workspaceId: Types.ObjectId;
  contentPlanId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  title: string;
  concept: string | null;
  rationale: string | null;
  objective: string | null;
  audience: string[];
  platform: ContentPlatform | null;
  format: ContentFormat | null;
  pillar: string | null;
  angle: ContentAngle | null;
  hook: string | null;
  suggestedAngle: string | null;
  scheduledFor: Date | null;
  status: ContentPlanItemStatus;
  rejectionReason: string | null;
  /** Se fija en una sola operación atómica al aceptar: garantiza un único ContentItem. */
  convertedContentItemId: Types.ObjectId | null;
  /** Orden dentro del plan (el del modelo, tras la validación). */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentPlanItemDocument = HydratedDocument<ContentPlanItemAttrs>;

const contentPlanItemSchema = new Schema<ContentPlanItemAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    contentPlanId: { type: Schema.Types.ObjectId, ref: 'ContentPlan', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    concept: { type: String, default: null, maxlength: 2000 },
    rationale: { type: String, default: null, maxlength: 1000 },
    objective: { type: String, default: null, maxlength: 300 },
    audience: { type: [String], default: [] },
    platform: { type: String, enum: [...ContentPlatformSchema.options, null], default: null },
    format: { type: String, enum: [...ContentFormatSchema.options, null], default: null },
    pillar: { type: String, default: null, maxlength: 80 },
    angle: { type: String, enum: [...ContentAngleSchema.options, null], default: null },
    hook: { type: String, default: null, maxlength: 500 },
    suggestedAngle: { type: String, default: null, maxlength: 300 },
    scheduledFor: { type: Date, default: null },
    status: {
      type: String,
      enum: ContentPlanItemStatusSchema.options,
      required: true,
      default: 'proposed',
    },
    rejectionReason: { type: String, default: null, maxlength: 300 },
    convertedContentItemId: { type: Schema.Types.ObjectId, ref: 'ContentItem', default: null },
    position: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

contentPlanItemSchema.index({ workspaceId: 1, contentPlanId: 1, position: 1 });
contentPlanItemSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const ContentPlanItemModel = model<ContentPlanItemAttrs>(
  'ContentPlanItem',
  contentPlanItemSchema,
  'content_plan_items',
);

export function toContentPlanItemDTO(doc: ContentPlanItemDocument): ContentPlanItem {
  return ContentPlanItemSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contentPlanId: doc.contentPlanId.toString(),
    projectId: doc.projectId?.toString() ?? null,
    title: doc.title,
    concept: doc.concept ?? null,
    rationale: doc.rationale ?? null,
    objective: doc.objective ?? null,
    audience: [...doc.audience],
    platform: doc.platform ?? null,
    format: doc.format ?? null,
    pillar: doc.pillar ?? null,
    angle: doc.angle ?? null,
    hook: doc.hook ?? null,
    suggestedAngle: doc.suggestedAngle ?? null,
    scheduledFor: doc.scheduledFor?.toISOString() ?? null,
    status: doc.status,
    rejectionReason: doc.rejectionReason ?? null,
    convertedContentItemId: doc.convertedContentItemId?.toString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
