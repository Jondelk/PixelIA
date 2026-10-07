import { AvatarResponseSchema, type AvatarResponse } from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

/** `apiBase`: companyApiBase(companyId) o workspaceApiBase(workspaceId) (lib/apiPaths). */
export function getAvatar(apiBase: string, signal?: AbortSignal): Promise<AvatarResponse> {
  return apiRequest(`${apiBase}/avatar`, AvatarResponseSchema, { signal });
}

export function generateAvatar(apiBase: string): Promise<AvatarResponse> {
  return apiRequest(`${apiBase}/avatar/generate`, AvatarResponseSchema, { method: 'POST' });
}
