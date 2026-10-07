import { describe, expect, it } from 'vitest';
import {
  BRAND_ARCHETYPES,
  BrandArchetypeSchema,
  CommunicationStepSchema,
  CompanyStepSchema,
  PersonalityStepSchema,
  SaveOnboardingStepInputSchema,
  VisualStepSchema,
  nextOnboardingStep,
} from './index.js';

describe('pasos del onboarding', () => {
  it('normaliza listas: recorta, elimina vacíos y duplicados', () => {
    const data = PersonalityStepSchema.parse({
      attributes: [' Cercana ', 'cercana', '', 'artesanal', 'premium'],
    });
    expect(data.attributes).toEqual(['Cercana', 'artesanal', 'premium']);
  });

  it('exige al menos 3 atributos de personalidad', () => {
    const result = PersonalityStepSchema.safeParse({ attributes: ['a', 'A', 'b'] });
    expect(result.success).toBe(false);
  });

  it('el origen es opcional y se guarda como null', () => {
    const data = CompanyStepSchema.parse({
      name: 'Café Tinto',
      industry: 'Café',
      description: 'Café de origen colombiano',
      history: 'Una finca familiar del Huila',
      origin: '   ',
    });
    expect(data.origin).toBeNull();
  });

  it('valida colores hexadecimales y los normaliza a mayúsculas', () => {
    const base = {
      styles: ['orgánico'],
      shapes: ['orgánicas'],
      materials: [],
      references: [],
      recurringElements: [],
      avoid: [],
    };
    expect(
      VisualStepSchema.parse({ ...base, colors: [{ hex: '#6b3e26', name: '' }] }).colors,
    ).toEqual([{ hex: '#6B3E26', name: null }]);
    expect(VisualStepSchema.safeParse({ ...base, colors: [{ hex: 'marrón' }] }).success).toBe(
      false,
    );
    expect(VisualStepSchema.safeParse({ ...base, colors: [] }).success).toBe(false);
  });

  it('formalidad y energía son niveles de 1 a 5 y el idioma es un código conocido', () => {
    const base = { tone: ['cálido'], wordsToUse: [], wordsToAvoid: [] };
    expect(
      CommunicationStepSchema.safeParse({ ...base, formality: 3, energy: 5, language: 'es' })
        .success,
    ).toBe(true);
    expect(
      CommunicationStepSchema.safeParse({ ...base, formality: 6, energy: 3, language: 'es' })
        .success,
    ).toBe(false);
    expect(
      CommunicationStepSchema.safeParse({ ...base, formality: 3, energy: 3, language: 'klingon' })
        .success,
    ).toBe(false);
  });

  it('PUT exige un paso conocido con sus datos', () => {
    expect(SaveOnboardingStepInputSchema.safeParse({ step: 'otro', data: {} }).success).toBe(false);
    expect(
      SaveOnboardingStepInputSchema.safeParse({
        step: 'personality',
        data: { attributes: ['a', 'b', 'c'] },
      }).success,
    ).toBe(true);
  });

  it('nextOnboardingStep devuelve el primer paso pendiente', () => {
    expect(nextOnboardingStep([])).toBe('company');
    expect(nextOnboardingStep(['company', 'purpose'])).toBe('audience');
  });
});

describe('arquetipos', () => {
  it('el catálogo tiene los 12 arquetipos y coincide con el schema', () => {
    expect(Object.keys(BRAND_ARCHETYPES)).toHaveLength(12);
    expect(BrandArchetypeSchema.options).toEqual(Object.keys(BRAND_ARCHETYPES));
  });
});
