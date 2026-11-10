import {
  ExtractDocumentsInputSchema,
  SaveOnboardingStepInputSchema,
  type BrandBrainResponse,
  type ExtractDocumentsResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import { getBrandBrain, saveOnboardingStep } from './brandDna.service.js';
import { extractOnboarding, type ExtractionDeps } from './extraction/extraction.service.js';

/** Ruta que acepta cuerpos grandes (documentos en base64); ver app.ts. */
export const EXTRACT_PATH = /\/brand-dna\/extract\/?$/;

/**
 * Módulo brand-dna — /api/companies/:companyId/brand-dna ("Brand Brain").
 * Montado detrás de requireAuth + requireCompanyAccess: `req.company` ya está autorizada.
 */
export function createBrandDnaRouter(deps: ExtractionDeps): Router {
  const router = Router({ mergeParams: true });

  /** Progreso del onboarding y BrandDNA vigente (null si aún no está completo). */
  router.get('/', async (req, res) => {
    const body: BrandBrainResponse = await getBrandBrain(getCompany(req));
    res.json(body);
  });

  /** Guarda un paso del onboarding. Al completar los 8 pasos se (re)genera el BrandDNA. */
  router.put('/', async (req, res) => {
    const input = SaveOnboardingStepInputSchema.parse(req.body);
    const body: BrandBrainResponse = await saveOnboardingStep(getCompany(req), input);
    res.json(body);
  });

  /**
   * Lee documentos de la marca y propone respuestas para el onboarding. No guarda nada: el usuario
   * revisa la propuesta en el formulario y guarda cada paso.
   */
  router.post('/extract', async (req, res) => {
    const input = ExtractDocumentsInputSchema.parse(req.body);
    const body: ExtractDocumentsResponse = await extractOnboarding(getCompany(req), input, deps);
    res.json(body);
  });

  return router;
}
