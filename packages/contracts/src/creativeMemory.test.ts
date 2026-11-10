import { describe, expect, it } from 'vitest';
import { workspaceSupportsFeature } from './capabilities.js';
import {
  CREATIVE_MEMORY_SCOPE_SPECIFICITY,
  CreativeMemoryKeySchema,
  CreativeMemoryListQuerySchema,
  CreativeSignalSchema,
  GeneratedCreativeMemorySynthesisSchema,
  RememberCreativeMemorySchema,
} from './creativeMemory.js';
import { pixelIntentAvailable } from './pixelCommand.js';

const ID = '6ac93cc3a738fe62abe5b039';

describe('Creative Memory: contratos', () => {
  it('Personal y Enterprise; no habilita el Brand Guardian en Personal', () => {
    expect(workspaceSupportsFeature('personal', 'creativeMemory')).toBe(true);
    expect(workspaceSupportsFeature('enterprise', 'creativeMemory')).toBe(true);
    expect(workspaceSupportsFeature('personal', 'brandGuardian')).toBe(false);
    expect(pixelIntentAvailable('personal', 'manage_memory')).toBe(true);
    expect(pixelIntentAvailable('enterprise', 'manage_memory')).toBe(true);
  });

  it('claves normalizadas dimension:tema:polaridad', () => {
    expect(CreativeMemoryKeySchema.safeParse('format:story:avoid').success).toBe(true);
    expect(CreativeMemoryKeySchema.safeParse('visual:neon:allow').success).toBe(true);
    expect(CreativeMemoryKeySchema.safeParse('Evitar Stories').success).toBe(false);
    expect(CreativeMemoryKeySchema.safeParse('format:story:maybe').success).toBe(false);
    expect(
      CreativeSignalSchema.safeParse({
        dimension: 'format',
        subject: 'story',
        action: 'avoid',
        value: null,
        previousValue: null,
        normalizedKey: 'format:story:avoid',
        strength: 'medium',
      }).success,
    ).toBe(true);
  });

  it('recordar: el alcance no-workspace exige su recurso; nada de campos extra', () => {
    expect(RememberCreativeMemorySchema.parse({ text: 'Evita las Stories' }).scope).toEqual({
      type: 'workspace',
    });
    expect(
      RememberCreativeMemorySchema.safeParse({ text: 'Neón', scope: { type: 'campaign' } }).success,
    ).toBe(false);
    expect(
      RememberCreativeMemorySchema.safeParse({
        text: 'Se permite neón',
        scope: { type: 'campaign', id: ID },
      }).success,
    ).toBe(true);
    expect(
      RememberCreativeMemorySchema.safeParse({ text: 'Evita Stories', workspaceId: ID }).success,
    ).toBe(false);
    expect(CreativeMemoryListQuerySchema.parse({}).view).toBe('all');
  });

  it('especificidad: plan > proyecto / campaña > workspace', () => {
    const s = CREATIVE_MEMORY_SCOPE_SPECIFICITY;
    expect(s.content_plan).toBeGreaterThan(s.campaign);
    expect(s.campaign).toBe(s.project);
    expect(s.project).toBeGreaterThan(s.workspace);
  });

  it('el sintetizador solo cita EVENT_n (nunca ids de Mongo)', () => {
    const base = { shouldCreateCandidate: true, statement: 'Suele preferir CTA suaves' };
    expect(
      GeneratedCreativeMemorySynthesisSchema.safeParse({ ...base, evidenceRefs: ['EVENT_1'] })
        .success,
    ).toBe(true);
    expect(
      GeneratedCreativeMemorySynthesisSchema.safeParse({ ...base, evidenceRefs: [ID] }).success,
    ).toBe(false);
  });
});
