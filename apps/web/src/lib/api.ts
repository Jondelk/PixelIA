import { ApiErrorSchema, HealthResponseSchema, type HealthResponse } from '@pixel/contracts';

/** Vacío = mismo origen (/api), que en desarrollo pasa por el proxy de Vite. */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
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
    ? new ApiRequestError(status, parsed.data.error.code, parsed.data.error.message)
    : new ApiRequestError(status, 'UNKNOWN', `Respuesta inesperada de la API (${status})`);
}

/** GET /api/health. Un 503 con cuerpo válido es una respuesta "degraded", no un error. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal, credentials: 'include' });
  const body = await readJson(res);
  const health = HealthResponseSchema.safeParse(body);
  if (health.success) return health.data;
  throw toApiError(res.status, body);
}
