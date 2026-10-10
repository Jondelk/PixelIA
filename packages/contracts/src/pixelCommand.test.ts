import { describe, expect, it } from 'vitest';
import {
  availablePixelIntents,
  CreatePixelCommandSchema,
  GeneratedPixelInterpretationSchema,
  pixelIntentAvailable,
} from './pixelCommand.js';

describe('PixelCommand: intenciones por capacidades', () => {
  it('Enterprise puede crear campañas; Personal no', () => {
    expect(pixelIntentAvailable('enterprise', 'create_campaign')).toBe(true);
    expect(pixelIntentAvailable('personal', 'create_campaign')).toBe(false);
    expect(availablePixelIntents('personal')).toEqual([
      'plan_content',
      'create_content',
      'organize_project',
      'create_tasks',
      'creative_advice',
      'work_status',
      'unknown',
    ]);
  });

  it('la solicitud es texto natural (voz mañana, mismo campo) y nunca trae el tenant', () => {
    expect(CreatePixelCommandSchema.parse({ request: '  Lanza TINTO  ' })).toEqual({
      request: 'Lanza TINTO',
      source: 'text',
      tzOffset: 0,
    });
    expect(CreatePixelCommandSchema.safeParse({ request: 'x', workspaceId: 'abc' }).success).toBe(
      false,
    );
    expect(CreatePixelCommandSchema.safeParse({ request: '' }).success).toBe(false);
  });

  it('la interpretación de la IA solo admite intenciones conocidas', () => {
    expect(
      GeneratedPixelInterpretationSchema.safeParse({
        intent: 'delete_everything',
        confidence: 1,
        entities: {},
      }).success,
    ).toBe(false);
  });
});
