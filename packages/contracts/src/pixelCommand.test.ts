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
      'manage_memory',
      'external_action',
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

describe('Prompt 18: acciones, servicios externos y salida del planificador', () => {
  it('una acción del plan es humana: sin herramienta, capacidad ni entrada', async () => {
    const { PixelPlanActionSchema } = await import('./pixelCommand.js');
    const parsed = PixelPlanActionSchema.parse({
      id: 'step_1.project',
      stepId: 'step_1',
      kind: 'project',
      effect: 'create',
      title: 'Crear el proyecto «Parcial»',
      label: 'Parcial',
      status: 'pending',
      resource: null,
      error: null,
      toolKey: 'workspace.projects',
      input: { name: 'Parcial' },
    });
    expect(parsed).not.toHaveProperty('toolKey');
    expect(parsed).not.toHaveProperty('input');
  });

  it('servicios externos reconocidos (pagos incluidos, para decir que no)', async () => {
    const { PixelCommandEntitiesSchema } = await import('./pixelCommand.js');
    expect(
      PixelCommandEntitiesSchema.parse({ externalService: 'google_calendar' }).externalService,
    ).toBe('google_calendar');
    expect(PixelCommandEntitiesSchema.safeParse({ externalService: 'whatsapp_bot' }).success).toBe(
      false,
    );
    expect(PixelCommandEntitiesSchema.parse({}).externalService).toBeNull();
  });

  it('la salida del planificador de IA solo trae referencias (las resuelve el backend)', async () => {
    const { GeneratedActionPlanSchema } = await import('./pixelActions.js');
    const plan = GeneratedActionPlanSchema.parse({
      responseMode: 'proposal',
      actions: [
        { capabilityRef: 'CAPABILITY_1', title: 'Crear el proyecto', input: { name: 'X' } },
      ],
    });
    expect(plan.actions[0]).toMatchObject({ dependsOn: null, reason: null });
    expect(GeneratedActionPlanSchema.safeParse({ responseMode: 'execute_now' }).success).toBe(
      false,
    );
    expect(
      GeneratedActionPlanSchema.safeParse({
        responseMode: 'proposal',
        actions: [{ capabilityRef: 'CAPABILITY_1', title: '', input: {} }],
      }).success,
    ).toBe(false);
  });
});
