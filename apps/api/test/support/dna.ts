import { BrandOnboardingSchema, type AvatarProfile, type BrandDna } from '@pixel/contracts';
import { rulesAvatarEngine } from '../../src/modules/avatars/engine/rulesAvatarEngine.js';
import { generateBrandDna } from '../../src/modules/brand-dna/brandDna.generator.js';
import type { cafeTinto } from '../fixtures/onboarding.js';

const now = new Date().toISOString();

export function brandDnaFor(
  answers: typeof cafeTinto,
  companyId = '507f1f77bcf86cd799439011',
): BrandDna {
  return {
    ...generateBrandDna(BrandOnboardingSchema.parse(answers)),
    id: '507f1f77bcf86cd799439099',
    companyId,
    version: 1,
    generator: { kind: 'deterministic', version: 'rules-1' },
    createdAt: now,
  };
}

export async function avatarFor(
  dna: BrandDna,
  workspaceId = '507f1f77bcf86cd799439021',
): Promise<AvatarProfile> {
  const concept = await rulesAvatarEngine.generate({ brandDna: dna, variation: 0 });
  return {
    ...concept,
    id: '507f1f77bcf86cd799439098',
    workspaceId,
    sourceType: 'brand',
    companyId: dna.companyId,
    version: 1,
    brandDnaVersion: dna.version,
    personalDnaVersion: null,
    engine: { kind: 'deterministic', version: 'avatar-rules-1', variation: 0 },
    createdAt: now,
  };
}
