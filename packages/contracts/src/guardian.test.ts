import { describe, expect, it } from 'vitest';
import { workspaceSupportsFeature } from './capabilities.js';
import {
  EvaluateGuardianSchema,
  GeneratedGuardianEvaluationSchema,
  GUARDIAN_DEFAULT_MODE,
} from './guardian.js';

describe('Brand Guardian: contratos', () => {
  it('solo Enterprise', () => {
    expect(workspaceSupportsFeature('enterprise', 'brandGuardian')).toBe(true);
    expect(workspaceSupportsFeature('personal', 'brandGuardian')).toBe(false);
  });

  it('un texto pegado exige contenido; un recurso, su id; el preflight no se pide por HTTP', () => {
    expect(EvaluateGuardianSchema.safeParse({ resourceType: 'copy' }).success).toBe(false);
    expect(EvaluateGuardianSchema.safeParse({ resourceType: 'campaign' }).success).toBe(false);
    expect(
      EvaluateGuardianSchema.safeParse({
        resourceType: 'pixel_proposal',
        resourceId: '6ac93cc3a738fe62abe5b039',
      }).success,
    ).toBe(false);
    expect(EvaluateGuardianSchema.parse({ resourceType: 'copy', content: ' Hola ' })).toEqual({
      resourceType: 'copy',
      content: 'Hola',
      confirmedFacts: [],
    });
    expect(
      EvaluateGuardianSchema.safeParse({ resourceType: 'copy', content: 'x', workspaceId: 'w' })
        .success,
    ).toBe(false);
    expect(GUARDIAN_DEFAULT_MODE.content_plan).toBe('content_plan');
  });

  it('la IA solo cita referencias controladas', () => {
    const finding = {
      dimension: 'identity',
      severity: 'medium',
      code: 'tone_drift',
      title: 'Se aleja del tono',
      message: 'El texto se aleja del tono cálido de la marca.',
      evidenceRefs: ['RESOURCE_TEXT_1'],
      brandRefs: ['BRAND_TONE_1'],
      recommendation: 'Habla con más cercanía.',
    };
    expect(
      GeneratedGuardianEvaluationSchema.safeParse({ dimensions: [], findings: [finding] }).success,
    ).toBe(true);
    expect(
      GeneratedGuardianEvaluationSchema.safeParse({
        dimensions: [],
        findings: [{ ...finding, brandRefs: ['6ac93cc3a738fe62abe5b039'] }],
      }).success,
    ).toBe(false);
  });
});
