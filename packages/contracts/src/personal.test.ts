import { describe, expect, it } from 'vitest';
import {
  GoalsStepSchema,
  nextPersonalOnboardingStep,
  PersonalDnaContentSchema,
  personalDnaCompleteness,
  PersonalPersonalityStepSchema,
  SavePersonalOnboardingStepInputSchema,
  SupportStepSchema,
  UpdatePersonalDnaSchema,
  type PersonalDnaContent,
} from './index.js';

const emptyDna: PersonalDnaContent = PersonalDnaContentSchema.parse({
  identity: { name: 'Jhon', professionalIdentity: [], summary: null },
  professionalProfile: { roles: [], skills: [], industries: [], strengths: [] },
  goals: { professional: [], personal: [], content: [], shortTerm: [], longTerm: [] },
  audience: {
    primaryAudience: null,
    secondaryAudiences: [],
    needs: [],
    problems: [],
    desiredPerception: [],
  },
  personality: { traits: [], archetypes: [] },
  communication: {
    tone: [],
    formality: 3,
    energy: 3,
    language: 'es',
    preferredWords: [],
    avoidWords: [],
  },
  creativeIdentity: {
    styles: [],
    colors: [],
    references: [],
    visualPreferences: [],
    avoidVisuals: [],
  },
  contentIdentity: { themes: [], preferredFormats: [], platforms: [], frequencyPreference: null },
  workStyle: {
    preferredWorkTimes: [],
    planningStyle: [],
    executionStyle: [],
    focusStyle: [],
    productivityPreferences: [],
  },
  supportNeeds: { wantsHelpWith: [], expectations: null },
  preferences: [],
  restrictions: [],
});

describe('Onboarding personal', () => {
  it('exige al menos un objetivo, un rasgo y una ayuda', () => {
    const noGoals = GoalsStepSchema.safeParse({
      professional: [],
      personal: [],
      content: [],
      shortTerm: [],
      longTerm: [],
    });
    expect(noGoals.success).toBe(false);
    expect(noGoals.error?.issues[0]?.message).toBe('Añade al menos un objetivo');
    expect(PersonalPersonalityStepSchema.safeParse({ traits: [] }).success).toBe(false);
    expect(SupportStepSchema.safeParse({ wantsHelpWith: [], expectations: '' }).success).toBe(
      false,
    );
  });

  it('normaliza listas y textos opcionales (vacío → null)', () => {
    const parsed = SavePersonalOnboardingStepInputSchema.parse({
      step: 'support',
      data: { wantsHelpWith: [' contenido ', 'Contenido', 'proyectos'], expectations: '  ' },
    });
    expect(parsed).toEqual({
      step: 'support',
      data: { wantsHelpWith: ['contenido', 'proyectos'], expectations: null },
    });
  });

  it('rechaza pasos desconocidos (nada de tareas ni proyectos todavía)', () => {
    expect(
      SavePersonalOnboardingStepInputSchema.safeParse({ step: 'tasks', data: {} }).success,
    ).toBe(false);
  });

  it('el siguiente paso es el primero sin completar', () => {
    expect(nextPersonalOnboardingStep([])).toBe('identity');
    expect(nextPersonalOnboardingStep(['identity', 'goals'])).toBe('audience');
  });
});

describe('PersonalDNA', () => {
  it('un ADN vacío no inventa nada y su completitud es 0 %', () => {
    expect(personalDnaCompleteness(emptyDna)).toMatchObject({ percent: 0, filled: 0, total: 11 });
    expect(emptyDna.identity.interests).toEqual([]);
  });

  it('la completitud cuenta las secciones con datos', () => {
    const partial = {
      ...emptyDna,
      personality: { traits: ['curiosa'], archetypes: [] },
      supportNeeds: { wantsHelpWith: ['contenido'], expectations: null },
    };
    const result = personalDnaCompleteness(partial);
    expect(result.filled).toBe(2);
    expect(result.missing).not.toContain('Personalidad');
    expect(result.missing).toContain('Objetivos');
  });

  it('las correcciones manuales son parciales, estrictas y no vacías', () => {
    expect(UpdatePersonalDnaSchema.safeParse({}).success).toBe(false);
    expect(UpdatePersonalDnaSchema.safeParse({ tasks: [] }).success).toBe(false);
    expect(UpdatePersonalDnaSchema.safeParse({ preferences: ['luz natural'] }).success).toBe(true);
  });

  it('los arquetipos son una lista cerrada', () => {
    expect(
      PersonalDnaContentSchema.safeParse({
        ...emptyDna,
        personality: { traits: ['x'], archetypes: ['robot'] },
      }).success,
    ).toBe(false);
  });
});
