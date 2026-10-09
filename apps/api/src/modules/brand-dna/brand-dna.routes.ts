import { SaveOnboardingStepInputSchema, type BrandBrainResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { getBrandBrain, saveOnboardingStep } from './brandDna.service.js';

/**
 * Módulo brand-dna — /api/companies/:companyId/brand-dna ("Brand Brain").
 * Montado detrás de requireAuth + requireCompanyAccess: `req.company` ya está autorizada.
 */
export const brandDnaRouter: Router = Router({ mergeParams: true });

/** Progreso del onboarding y BrandDNA vigente (null si aún no está completo). */
brandDnaRouter.get('/', async (req, res) => {
  const body: BrandBrainResponse = await getBrandBrain(getCompany(req));
  res.json(body);
});

/** Guarda un paso del onboarding. Al completar los 8 pasos se (re)genera el BrandDNA. */
brandDnaRouter.put('/', async (req, res) => {
  const input = SaveOnboardingStepInputSchema.parse(req.body);
  const body: BrandBrainResponse = await saveOnboardingStep(getCompany(req), input);
  res.json(body);
});
