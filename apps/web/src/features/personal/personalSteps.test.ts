import { PERSONAL_ONBOARDING_STEP_SCHEMAS } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { fieldKey, personalZodErrors, STEP_ERROR } from './personalSteps';

describe('errores del onboarding personal', () => {
  it('un elemento de una lista se marca en su campo', () => {
    expect(fieldKey(['roles', 0])).toBe('roles');
    expect(fieldKey(['colors', 1, 'name'])).toBe('colors');
    expect(fieldKey(['content', 'themes', 2])).toBe('content.themes');
    expect(fieldKey([])).toBe(STEP_ERROR);
  });

  it('una etiqueta demasiado larga marca el campo, no solo el aviso general', () => {
    const parsed = PERSONAL_ONBOARDING_STEP_SCHEMAS.identity.safeParse({
      name: 'Jhon',
      profession: 'Director creativo',
      headline: '',
      bio: '',
      roles: ['x'.repeat(130)],
      skills: [],
      interests: [],
      location: '',
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(personalZodErrors(parsed.error).roles).toMatch(/120 caracteres/);
  });

  it('un paso sin objetivos muestra el error del paso', () => {
    const parsed = PERSONAL_ONBOARDING_STEP_SCHEMAS.goals.safeParse({
      professional: [],
      personal: [],
      content: [],
      shortTerm: [],
      longTerm: [],
    });
    if (parsed.success) throw new Error('debía fallar');
    expect(personalZodErrors(parsed.error)[STEP_ERROR]).toBe('Añade al menos un objetivo');
  });
});
