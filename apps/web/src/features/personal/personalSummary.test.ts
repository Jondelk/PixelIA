import type { PersonalDnaContent } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { personalUnderstanding } from './personalSummary';

const empty: PersonalDnaContent = {
  identity: { name: 'Jhon', professionalIdentity: [], summary: null, interests: [] },
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
};

describe('personalUnderstanding', () => {
  it('resume a la persona solo con lo que contó', () => {
    expect(
      personalUnderstanding({
        ...empty,
        identity: {
          ...empty.identity,
          professionalIdentity: ['Director creativo', 'Diseño', 'Audiovisual'],
        },
        goals: { ...empty.goals, professional: ['Crear autoridad profesional'] },
        audience: { ...empty.audience, primaryAudience: 'Marcas que quieren diferenciarse' },
        communication: { ...empty.communication, tone: ['directo', 'experto'] },
        creativeIdentity: { ...empty.creativeIdentity, styles: ['minimalista', 'cinematográfico'] },
        supportNeeds: { wantsHelpWith: ['contenido', 'proyectos'], expectations: null },
      }),
    ).toEqual([
      'Eres director creativo.',
      'Quieres crear autoridad profesional y le hablas a marcas que quieren diferenciarse.',
      'Tu tono es directo y experto y tu estética, minimalista y cinematográfico.',
      'Te ayudaré sobre todo con contenido y proyectos.',
    ]);
  });

  it('sin datos no inventa frases', () => {
    expect(personalUnderstanding(empty)).toEqual([]);
  });
});
