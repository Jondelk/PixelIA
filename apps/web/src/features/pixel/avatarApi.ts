import {
  AvatarModelResponseSchema,
  AvatarResponseSchema,
  type AvatarModelResponse,
  type AvatarResponse,
} from '@pixel/contracts';
import { apiRequest, apiUrl } from '../../lib/api';

/** `apiBase`: companyApiBase(companyId) o workspaceApiBase(workspaceId) (lib/apiPaths). */
export function getAvatar(apiBase: string, signal?: AbortSignal): Promise<AvatarResponse> {
  return apiRequest(`${apiBase}/avatar`, AvatarResponseSchema, { signal });
}

export function generateAvatar(apiBase: string): Promise<AvatarResponse> {
  return apiRequest(`${apiBase}/avatar/generate`, AvatarResponseSchema, { method: 'POST' });
}

/** Estado del modelo 3D de la versión vigente del personaje. */
export function getAvatarModel(
  apiBase: string,
  signal?: AbortSignal,
): Promise<AvatarModelResponse> {
  return apiRequest(`${apiBase}/avatar/model`, AvatarModelResponseSchema, { signal });
}

/** Pide esculpir el modelo 3D (o reconstruirlo con force). */
export function buildAvatarModel(apiBase: string, force = false): Promise<AvatarModelResponse> {
  const query = force ? '?force=true' : '';
  return apiRequest(`${apiBase}/avatar/model${query}`, AvatarModelResponseSchema, {
    method: 'POST',
  });
}

/** URL para mostrar un archivo del modelo (renders, .glb). */
export function modelFileUrl(fileUrl: string): string {
  return apiUrl(fileUrl);
}

/** URL de descarga de un archivo del modelo (el navegador lo guarda en vez de abrirlo). */
export function downloadUrl(fileUrl: string): string {
  return apiUrl(`${fileUrl}${fileUrl.includes('?') ? '&' : '?'}download=1`);
}
