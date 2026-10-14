import { z } from 'zod';
import { IsoDateSchema } from './common.js';

/*
 * AvatarModel: el personaje de la marca esculpido en 3D a partir de un AvatarProfile.
 *
 * El AvatarProfile sigue siendo el concepto (qué es el personaje y por qué). El AvatarModel es su
 * producción 3D profesional, hecha por el motor propio Pixel Sculpt dentro de la API (sin
 * programas externos ni servicios de IA): un .glb animable para la web y cualquier programa 3D,
 * y renders de estudio para el manual de marca.
 */

export const AvatarModelStatusSchema = z.enum(['queued', 'building', 'ready', 'failed']);
export type AvatarModelStatus = z.infer<typeof AvatarModelStatusSchema>;

/** Archivos que produce una construcción. Los nombres son fijos: la API no sirve otros. */
export const AVATAR_MODEL_FILES = {
  glb: 'avatar.glb',
  hero: 'hero.png',
  front: 'front.png',
  threeQuarter: 'three_quarter.png',
  side: 'side.png',
  cutout: 'cutout.png',
} as const;
export type AvatarModelFileKey = keyof typeof AVATAR_MODEL_FILES;
export const AvatarModelFileNameSchema = z.enum(
  Object.values(AVATAR_MODEL_FILES) as [string, ...string[]],
);

const FileUrl = z.string().nullable();

export const AvatarModelFilesSchema = z.object({
  /** Modelo 3D (glTF binario): web, Blender, Maya, Cinema 4D, motores de juego… */
  glb: FileUrl,
  /** Render principal sobre fondo de estudio. */
  hero: FileUrl,
  front: FileUrl,
  threeQuarter: FileUrl,
  side: FileUrl,
  /** Render con fondo transparente (para piezas y el manual). */
  cutout: FileUrl,
});
export type AvatarModelFiles = z.infer<typeof AvatarModelFilesSchema>;

export const AvatarModelSchema = z.object({
  /** Versión del AvatarProfile que se construyó. */
  avatarVersion: z.number().int().min(1),
  status: AvatarModelStatusSchema,
  /** Motor y versión que esculpió el modelo, p. ej. "pixel-sculpt 1.0.0". */
  engineVersion: z.string().nullable(),
  files: AvatarModelFilesSchema,
  /** Mensaje apto para el usuario si status = failed. */
  error: z.string().nullable(),
  startedAt: IsoDateSchema.nullable(),
  finishedAt: IsoDateSchema.nullable(),
  /** Duración de la última construcción en milisegundos. */
  durationMs: z.number().int().min(0).nullable(),
});
export type AvatarModel = z.infer<typeof AvatarModelSchema>;

/** Respuesta de GET y POST /api/workspaces/:workspaceId/avatar/model. */
export const AvatarModelResponseSchema = z.object({
  engine: z.object({
    /** Nombre del motor de modelado, p. ej. "Pixel Sculpt". */
    name: z.string(),
    version: z.string(),
    /** false si la producción 3D está desactivada en el servidor. */
    available: z.boolean(),
  }),
  /** Modelo del avatar vigente; null si nunca se construyó. */
  model: AvatarModelSchema.nullable(),
});
export type AvatarModelResponse = z.infer<typeof AvatarModelResponseSchema>;

export const AVATAR_MODEL_STATUS_LABELS: Record<AvatarModelStatus, string> = {
  queued: 'En cola',
  building: 'Esculpiendo en 3D',
  ready: 'Listo',
  failed: 'Falló',
};
