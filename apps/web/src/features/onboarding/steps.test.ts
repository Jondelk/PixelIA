import type { Company } from '@pixel/contracts';
import { ONBOARDING_STEP_SCHEMAS, ONBOARDING_STEPS } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { initialForms, STEP_META } from './steps';

const company: Company = {
  id: '507f1f77bcf86cd799439011',
  workspaceId: '507f1f77bcf86cd799439021',
  ownerId: '507f1f77bcf86cd799439012',
  name: 'Café Tinto',
  slug: 'cafe-tinto',
  industry: 'Café',
  description: 'Café de origen',
  logoUrl: null,
  status: 'draft',
  brandDnaVersion: null,
  avatarVersion: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('initialForms', () => {
  it('prellena el paso Empresa con los datos de la empresa', () => {
    expect(initialForms({}, company).company).toMatchObject({
      name: 'Café Tinto',
      industry: 'Café',
    });
  });

  it('convierte los null guardados en strings editables', () => {
    const forms = initialForms(
      {
        company: {
          name: 'X Co',
          industry: 'Retail',
          description: 'Descripción larga',
          history: 'Historia larga',
          origin: null,
        },
      },
      company,
    );
    expect(forms.company.origin).toBe('');
  });

  it('los formularios vacíos no pasan la validación de pasos con mínimos', () => {
    const forms = initialForms({}, company);
    expect(ONBOARDING_STEP_SCHEMAS.personality.safeParse(forms.personality).success).toBe(false);
    expect(ONBOARDING_STEP_SCHEMAS.visual.safeParse(forms.visual).success).toBe(false);
  });
});

describe('STEP_META', () => {
  it('describe los 8 pasos', () => {
    expect(Object.keys(STEP_META)).toEqual([...ONBOARDING_STEPS]);
  });
});
