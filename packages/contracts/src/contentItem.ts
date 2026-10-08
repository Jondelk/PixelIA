import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import {
  OperationSourceSchema,
  OptionalDateInputSchema,
  operationText,
  operationTitle,
  queryEnum,
  queryEnumList,
  queryLimit,
  queryOffset,
  querySearch,
  tagList,
} from './operations.js';

/*
 * ContentItem: una pieza de contenido EN PROCESO (idea → publicada). No es un post real: no hay
 * integración con redes; `published` solo registra que el usuario la publicó. Recurso del
 * Workspace; puede pertenecer a un Project del mismo workspace. `publishedAt` lo fija el servidor
 * al pasar a `published` (si no se envía) y lo limpia si la pieza vuelve a una etapa anterior.
 */

export const ContentPlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'x',
  'blog',
  'newsletter',
  'other',
]);
export type ContentPlatform = z.infer<typeof ContentPlatformSchema>;

export const ContentFormatSchema = z.enum([
  'reel',
  'carousel',
  'story',
  'post',
  'photo',
  'short_video',
  'long_video',
  'article',
  'podcast',
  'newsletter',
  'other',
]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const ContentStatusSchema = z.enum([
  'idea',
  'planned',
  'production',
  'review',
  'ready',
  'published',
  'archived',
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

/** Etapas del pipeline, en orden (archivado queda fuera del flujo). */
export const CONTENT_PIPELINE = [
  'idea',
  'planned',
  'production',
  'review',
  'ready',
  'published',
] as const satisfies ContentStatus[];

export const ContentItemSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  projectId: ObjectIdSchema.nullable(),
  title: z.string(),
  concept: z.string().nullable(),
  objective: z.string().nullable(),
  platform: ContentPlatformSchema.nullable(),
  format: ContentFormatSchema.nullable(),
  status: ContentStatusSchema,
  hook: z.string().nullable(),
  caption: z.string().nullable(),
  script: z.string().nullable(),
  notes: z.string().nullable(),
  scheduledFor: IsoDateSchema.nullable(),
  publishedAt: IsoDateSchema.nullable(),
  tags: z.array(z.string()),
  source: OperationSourceSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type ContentItemDTO = ContentItem;

const contentFields = {
  title: operationTitle('un título'),
  concept: operationText(2000),
  objective: operationText(500),
  platform: ContentPlatformSchema.nullable(),
  format: ContentFormatSchema.nullable(),
  status: ContentStatusSchema,
  hook: operationText(500),
  caption: operationText(5000),
  script: operationText(20_000),
  notes: operationText(5000),
  projectId: ObjectIdSchema.nullable(),
  scheduledFor: OptionalDateInputSchema,
  publishedAt: OptionalDateInputSchema,
  tags: tagList(),
};

/**
 * POST /api/workspaces/:workspaceId/content. Basta el título. `strict`: workspaceId o source en el
 * cuerpo son un 400.
 */
export const CreateContentItemSchema = z
  .object({
    title: contentFields.title,
    concept: contentFields.concept.default(null),
    objective: contentFields.objective.default(null),
    platform: contentFields.platform.default(null),
    format: contentFields.format.default(null),
    status: contentFields.status.default('idea'),
    hook: contentFields.hook.default(null),
    caption: contentFields.caption.default(null),
    script: contentFields.script.default(null),
    notes: contentFields.notes.default(null),
    projectId: contentFields.projectId.default(null),
    scheduledFor: contentFields.scheduledFor.default(null),
    publishedAt: contentFields.publishedAt.default(null),
    tags: contentFields.tags.default([]),
  })
  .strict();
export type CreateContentItemInput = z.input<typeof CreateContentItemSchema>;
export type CreateContentItemData = z.output<typeof CreateContentItemSchema>;

/** PATCH …/content/:contentItemId. Mover en el pipeline = `{ status }`. */
export const UpdateContentItemSchema = z
  .object(contentFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateContentItemInput = z.input<typeof UpdateContentItemSchema>;
export type UpdateContentItemData = z.output<typeof UpdateContentItemSchema>;

/**
 * GET …/content. Sin `status`, la lista excluye los archivados. Orden: actualizados más
 * recientemente primero.
 */
export const ContentItemListQuerySchema = z.object({
  status: queryEnumList(ContentStatusSchema),
  platform: queryEnum(ContentPlatformSchema),
  format: queryEnum(ContentFormatSchema),
  projectId: ObjectIdSchema.optional(),
  search: querySearch,
  limit: queryLimit,
  offset: queryOffset,
});
export type ContentItemListQuery = z.output<typeof ContentItemListQuerySchema>;

export const ContentItemResponseSchema = z.object({ contentItem: ContentItemSchema });
export type ContentItemResponse = z.infer<typeof ContentItemResponseSchema>;

export const ContentItemListResponseSchema = z.object({
  contentItems: z.array(ContentItemSchema),
  total: z.number().int().min(0),
});
export type ContentItemListResponse = z.infer<typeof ContentItemListResponseSchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: 'Idea',
  planned: 'Planificado',
  production: 'Producción',
  review: 'Revisión',
  ready: 'Listo',
  published: 'Publicado',
  archived: 'Archivado',
};

export const CONTENT_PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  blog: 'Blog',
  newsletter: 'Newsletter',
  other: 'Otra',
};

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  reel: 'Reel',
  carousel: 'Carrusel',
  story: 'Historia',
  post: 'Post',
  photo: 'Foto',
  short_video: 'Video corto',
  long_video: 'Video largo',
  article: 'Artículo',
  podcast: 'Podcast',
  newsletter: 'Newsletter',
  other: 'Otro',
};
