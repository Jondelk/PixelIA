import { ApiErrorSchema, HealthResponseSchema, type HealthResponse } from '@pixel/contracts';
import type { z } from 'zod';

/** Vacío = mismo origen (/api), que en desarrollo pasa por el proxy de Vite. */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface ApiFieldIssue {
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Errores de validación por campo devueltos por la API (VALIDATION_ERROR). */
  get fieldIssues(): ApiFieldIssue[] {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return [];
    return this.details.filter(
      (item): item is ApiFieldIssue =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ApiFieldIssue).path === 'string' &&
        typeof (item as ApiFieldIssue).message === 'string',
    );
  }
}

/** `details.reason` de un error de la API (p. ej. "personal_context_not_configured"). */
export function errorReason(err: unknown): string | null {
  if (!(err instanceof ApiRequestError)) return null;
  const { details } = err;
  if (typeof details !== 'object' || details === null || !('reason' in details)) return null;
  return typeof details.reason === 'string' ? details.reason : null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export function toApiError(status: number, body: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(body);
  return parsed.success
    ? new ApiRequestError(
        status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      )
    : new ApiRequestError(status, 'UNKNOWN', `Respuesta inesperada de la API (${status})`);
}

let unauthorizedHandler: (() => void) | null = null;

/** Se invoca cuando una petición protegida responde 401 (sesión expirada o cerrada). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      signal: options.signal,
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor');
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) unauthorizedHandler?.();
    throw toApiError(res.status, await readJson(res));
  }
  return res;
}

/** Petición JSON cuya respuesta se valida con un schema de contracts. */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const res = await send(path, options);
  const parsed = schema.safeParse(await readJson(res));
  if (!parsed.success) {
    throw new ApiRequestError(res.status, 'INVALID_RESPONSE', 'La API devolvió datos inesperados');
  }
  return parsed.data;
}

/** Petición sin cuerpo de respuesta (204). */
export async function apiSend(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

/** GET /api/health. Un 503 con cuerpo válido es una respuesta "degraded", no un error. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal, credentials: 'include' });
  const body = await readJson(res);
  const health = HealthResponseSchema.safeParse(body);
  if (health.success) return health.data;
  throw toApiError(res.status, body);
}

/** Mensaje apto para el usuario a partir de cualquier error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}
