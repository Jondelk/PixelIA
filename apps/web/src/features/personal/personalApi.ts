import {
  PersonalDnaResponseSchema,
  PersonalProfileResponseSchema,
  type PersonalDnaResponse,
  type PersonalProfileResponse,
  type SavePersonalOnboardingStepInput,
  type UpdatePersonalDnaInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';

/** Pixel Personal: solo existe bajo /api/workspaces/:workspaceId (workspace de tipo personal). */

export function getPersonalProfile(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<PersonalProfileResponse> {
  return apiRequest(
    `${workspaceApiBase(workspaceId)}/personal-profile`,
    PersonalProfileResponseSchema,
    { signal },
  );
}

/** Guardado progresivo: un paso del onboarding ("Guardar y continuar"). */
export function savePersonalStep(
  workspaceId: string,
  input: SavePersonalOnboardingStepInput,
): Promise<PersonalProfileResponse> {
  return apiRequest(
    `${workspaceApiBase(workspaceId)}/personal-profile`,
    PersonalProfileResponseSchema,
    { method: 'PUT', body: input },
  );
}

export function getPersonalDna(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<PersonalDnaResponse> {
  return apiRequest(`${workspaceApiBase(workspaceId)}/personal-dna`, PersonalDnaResponseSchema, {
    signal,
  });
}

export function updatePersonalDna(
  workspaceId: string,
  input: UpdatePersonalDnaInput,
): Promise<PersonalDnaResponse> {
  return apiRequest(`${workspaceApiBase(workspaceId)}/personal-dna`, PersonalDnaResponseSchema, {
    method: 'PUT',
    body: input,
  });
}

export function generatePersonalDna(workspaceId: string): Promise<PersonalDnaResponse> {
  return apiRequest(
    `${workspaceApiBase(workspaceId)}/personal-dna/generate`,
    PersonalDnaResponseSchema,
    { method: 'POST' },
  );
}
