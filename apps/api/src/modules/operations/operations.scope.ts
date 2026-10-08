import { Types, type QueryFilter } from 'mongoose';
import { AppError, notFound } from '../../lib/errors.js';
import { escapeRegex, isObjectIdString } from '../../lib/mongo.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { ProjectModel } from './project.model.js';

/*
 * Reglas compartidas de Operations. Todo parte del workspace YA autorizado por
 * requireWorkspaceAccess; ningún id de workspace sale del cuerpo de la petición.
 */

export const PROJECT_NOT_FOUND = 'Proyecto no encontrado';
export const TASK_NOT_FOUND = 'Tarea no encontrada';
export const CONTENT_NOT_FOUND = 'Contenido no encontrado';

/**
 * Id de un recurso de la URL. Un id malformado responde 404 como uno inexistente o ajeno, para no
 * revelar nada (y para que no llegue a Mongoose como CastError).
 */
export function resourceId(raw: unknown, message: string): Types.ObjectId {
  if (!isObjectIdString(raw)) throw notFound(message);
  return new Types.ObjectId(raw);
}

/** Error de validación por campo con la misma forma que los de Zod (VALIDATION_ERROR). */
export function fieldError(path: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ path, message }]);
}

/**
 * Verifica que un projectId del cuerpo pertenece al MISMO workspace. Inexistente o de otro
 * workspace responden igual (400 en `projectId`), sin revelar si existe en otro sitio.
 */
export async function assertProjectInWorkspace(
  workspace: WorkspaceDocument,
  projectId: string,
): Promise<Types.ObjectId> {
  const id = isObjectIdString(projectId) ? new Types.ObjectId(projectId) : null;
  const exists = id ? await ProjectModel.exists({ _id: id, workspaceId: workspace._id }) : null;
  if (!id || !exists) throw fieldError('projectId', PROJECT_NOT_FOUND);
  return id;
}

/** Fecha ISO de la entrada → Date (undefined = no tocar, null = borrar). Se guarda en UTC. */
export function toDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

/** Filtro de búsqueda simple, literal y sin distinguir mayúsculas. */
export function searchFilter<T>(
  fields: (keyof T & string)[],
  search: string | undefined,
): QueryFilter<T> {
  if (!search) return {} as QueryFilter<T>;
  const pattern = { $regex: escapeRegex(search), $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: pattern })) } as QueryFilter<T>;
}

const DAY_MS = 86_400_000;

/**
 * Límites [start, end) del día local del usuario en UTC. `tzOffset` es el de
 * `Date#getTimezoneOffset()` (minutos que hay que sumar a la hora local para obtener UTC).
 */
export function localDayBounds(now: Date, tzOffset: number): { start: Date; end: Date } {
  const shift = tzOffset * 60_000;
  const local = new Date(now.getTime() - shift);
  const startOfLocalDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startOfLocalDay + shift);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * `tzOffset` (convención de `Date#getTimezoneOffset()`) de una zona IANA en un instante: lo que usa
 * el servidor cuando no hay navegador (p. ej. el contexto del chat con la zona del workspace).
 */
export function timezoneOffsetMinutes(now: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0; // "GMT" a secas = UTC
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '+' ? -minutes : minutes;
}
