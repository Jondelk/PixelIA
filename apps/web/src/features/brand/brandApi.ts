import {
  BrandBrainResponseSchema,
  type BrandBrainResponse,
  type SaveOnboardingStepInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

const path = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/brand-dna`;

export function getBrandBrain(
  companyId: string,
  signal?: AbortSignal,
): Promise<BrandBrainResponse> {
  return apiRequest(path(companyId), BrandBrainResponseSchema, { signal });
}

export function saveOnboardingStep(
  companyId: string,
  input: SaveOnboardingStepInput,
): Promise<BrandBrainResponse> {
  return apiRequest(path(companyId), BrandBrainResponseSchema, { method: 'PUT', body: input });
}
