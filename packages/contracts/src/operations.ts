import { z } from 'zod';
import { IsoDateSchema } from './common.js';

/*
 * Operations: la capa operacional de un Workspace (Projects, Tasks, ContentItems).
 * Son recursos del WORKSPACE, no de Personal ni de Enterprise: su frontera de aislamiento es
 * siempre `workspaceId` (ver docs/OPERATIONS.md). Aquí viven las piezas que comparten los tres.
 */

export const PrioritySchema = z.enum(['low', 'medium', 'high']);
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * Quién creó el recurso. `manual` = el usuario desde la interfaz o la API; `pixel` = un servicio de
 * Pixel (planificación futura). Nunca llega del cliente: lo asigna el servidor.
 */
export const OperationSourceSchema = z.enum(['manual', 'pixel']);
export type OperationSource = z.infer<typeof OperationSourceSchema>;

export const OPERATION_TITLE_MAX = 160;
export const OPERATION_TAGS_MAX = 12;
export const OPERATION_LIST_LIMIT_MAX = 100;
export const OPERATION_LIST_LIMIT_DEFAULT = 50;

/** Título obligatorio de una operación. */
export const operationTitle = (label: string, max = OPERATION_TITLE_MAX) =>
  z
    .string({ error: `Escribe ${label}` })
    .trim()
    .min(1, `Escribe ${label}`)
    .max(max, `Máximo ${max} caracteres`);

/** Texto opcional de una operación: vacío → null. */
export const operationText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((value) => value || null)
    .nullable();

/** Fecha opcional (ISO 8601 en UTC); null la borra. */
export const OptionalDateInputSchema = IsoDateSchema.nullable();

/** Etiquetas cortas: recorta, quita vacíos y duplicados (sin distinguir mayúsculas). */
export const tagList = (max = OPERATION_TAGS_MAX) =>
  z
    .array(z.string().trim().max(40, 'Cada etiqueta admite máximo 40 caracteres'))
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.toLocaleLowerCase('es');
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .pipe(z.array(z.string()).max(max, `Máximo ${max} etiquetas`));

/* ---------- Query strings ---------- */

/** Un valor de query string tal como lo entrega Express (repetido = array). */
const queryValue = z.union([z.string(), z.array(z.string())]);

/**
 * Lista de valores de un enum en la query: `status=todo,doing` o `status=todo&status=doing`.
 * Un valor fuera del enum es un 400.
 */
export const queryEnumList = <T extends string>(schema: z.ZodType<T, string>) =>
  queryValue
    .transform((value) =>
      (Array.isArray(value) ? value : [value])
        .flatMap((part) => part.split(','))
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(schema).min(1).max(10))
    .optional();

/** Un único valor de un enum en la query. */
export const queryEnum = <T extends string>(schema: z.ZodType<T, string>) =>
  z.string().trim().pipe(schema).optional();

/** `start` <= `end` cuando ambas fechas existen. */
export const datesInOrder = (start?: string | null, end?: string | null): boolean =>
  !start || !end || Date.parse(start) <= Date.parse(end);

/** Texto de búsqueda simple (sin lenguaje de consulta). */
export const querySearch = z
  .string()
  .trim()
  .max(100, 'Búsqueda: máximo 100 caracteres')
  .transform((value) => value || undefined)
  .optional();

export const queryLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(OPERATION_LIST_LIMIT_MAX)
  .default(OPERATION_LIST_LIMIT_DEFAULT);

export const queryOffset = z.coerce.number().int().min(0).max(10_000).default(0);

/**
 * Diferencia en minutos entre UTC y la hora local del navegador (`Date#getTimezoneOffset()`;
 * Bogotá = 300). Solo sirve para calcular "hoy" en filtros por fecha; no se guarda.
 */
export const queryTzOffset = z.coerce.number().int().min(-840).max(840).default(0);

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};
