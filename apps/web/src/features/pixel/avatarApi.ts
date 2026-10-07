import { AvatarResponseSchema, type AvatarResponse } from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

const path = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/avatar`;

export function getAvatar(companyId: string, signal?: AbortSignal): Promise<AvatarResponse> {
  return apiRequest(path(companyId), AvatarResponseSchema, { signal });
}

export function generateAvatar(companyId: string): Promise<AvatarResponse> {
  return apiRequest(`${path(companyId)}/generate`, AvatarResponseSchema, { method: 'POST' });
}
