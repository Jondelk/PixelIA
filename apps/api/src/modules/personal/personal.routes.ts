import {
  SavePersonalOnboardingStepInputSchema,
  UpdatePersonalDnaSchema,
  type PersonalDnaResponse,
  type PersonalProfileResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  generatePersonalDna,
  getPersonalDna,
  getPersonalProfile,
  savePersonalOnboardingStep,
  updatePersonalDna,
  type PersonalDeps,
} from './personal.service.js';

/**
 * Módulo personal — montado en /api/workspaces/:workspaceId detrás de requireWorkspaceAccess y
 * requirePersonalWorkspace: `req.workspace` es un workspace personal del usuario de la sesión.
 */

/** /personal-profile: perfil y progreso del onboarding personal. */
export function createPersonalProfileRouter(deps: PersonalDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: PersonalProfileResponse = await getPersonalProfile(getWorkspace(req));
    res.json(body);
  });

  /** Guarda un paso del onboarding ("Guardar y continuar"). Al completar los 8 se genera el ADN. */
  router.put('/', async (req, res) => {
    const input = SavePersonalOnboardingStepInputSchema.parse(req.body);
    const body: PersonalProfileResponse = await savePersonalOnboardingStep(
      getWorkspace(req),
      input,
      deps,
    );
    res.json(body);
  });

  return router;
}

/** /personal-dna: ADN personal vigente, correcciones manuales y regeneración. */
export function createPersonalDnaRouter(deps: PersonalDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: PersonalDnaResponse = await getPersonalDna(getWorkspace(req));
    res.json(body);
  });

  router.put('/', async (req, res) => {
    const input = UpdatePersonalDnaSchema.parse(req.body);
    const body: PersonalDnaResponse = await updatePersonalDna(getWorkspace(req), input);
    res.json(body);
  });

  router.post('/generate', async (req, res) => {
    const body: PersonalDnaResponse = await generatePersonalDna(getWorkspace(req), deps);
    res.json(body);
  });

  return router;
}
