import {
  ContentFormatSchema,
  ContentItemSchema,
  ContentPlatformSchema,
  ContentStatusSchema,
  OperationSourceSchema,
  type ContentFormat,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
  type OperationSource,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * ContentItem: una pieza de contenido en proceso (no un post publicado en una red). Recurso del
 * Workspace; `projectId` apunta siempre a un Project del mismo workspace. Toda consulta filtra por
 * workspaceId.
 */
export interface ContentItemAttrs {
  workspaceId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  title: string;
  concept: string | null;
  objective: string | null;
  platform: ContentPlatform | null;
  format: ContentFormat | null;
  status: ContentStatus;
  hook: string | null;
  caption: string | null;
  script: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  /** Lo fija el servidor al pasar a `published` (si no llega) y lo limpia al volver atrás. */
  publishedAt: Date | null;
  tags: string[];
  source: OperationSource;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentItemDocument = HydratedDocument<ContentItemAttrs>;

const contentItemSchema = new Schema<ContentItemAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    concept: { type: String, default: null, maxlength: 2000 },
    objective: { type: String, default: null, maxlength: 500 },
    platform: { type: String, enum: [...ContentPlatformSchema.options, null], default: null },
    format: { type: String, enum: [...ContentFormatSchema.options, null], default: null },
    status: { type: String, enum: ContentStatusSchema.options, required: true, default: 'idea' },
    hook: { type: String, default: null, maxlength: 500 },
    caption: { type: String, default: null, maxlength: 5000 },
    script: { type: String, default: null, maxlength: 20_000 },
    notes: { type: String, default: null, maxlength: 5000 },
    scheduledFor: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    source: {
      type: String,
      enum: OperationSourceSchema.options,
      required: true,
      default: 'manual',
    },
  },
  { timestamps: true },
);

// Sin índice suelto por workspaceId: lo cubre el prefijo de los compuestos.
contentItemSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
contentItemSchema.index({ workspaceId: 1, scheduledFor: 1 });
contentItemSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
contentItemSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const ContentItemModel = model<ContentItemAttrs>(
  'ContentItem',
  contentItemSchema,
  'content_items',
);

export function toContentItemDTO(doc: ContentItemDocument): ContentItem {
  return ContentItemSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    projectId: doc.projectId?.toString() ?? null,
    title: doc.title,
    concept: doc.concept ?? null,
    objective: doc.objective ?? null,
    platform: doc.platform ?? null,
    format: doc.format ?? null,
    status: doc.status,
    hook: doc.hook ?? null,
    caption: doc.caption ?? null,
    script: doc.script ?? null,
    notes: doc.notes ?? null,
    scheduledFor: doc.scheduledFor?.toISOString() ?? null,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    tags: [...doc.tags],
    source: doc.source,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
