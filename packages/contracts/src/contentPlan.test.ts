import { describe, expect, it } from 'vitest';
import {
  GenerateContentPlanSchema,
  GeneratedContentPlanSchema,
  periodDays,
  UpdateContentPlanItemSchema,
} from './index.js';

describe('Content Planner', () => {
  it('generar: solo las fechas son obligatorias; periodo de 1 a 30 días', () => {
    expect(
      GenerateContentPlanSchema.parse({ startDate: '2026-10-12', endDate: '2026-10-25' }),
    ).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      tzOffset: 0,
    });
    expect(periodDays('2026-10-12', '2026-10-25')).toBe(14);
    expect(
      GenerateContentPlanSchema.safeParse({ startDate: '2026-10-01', endDate: '2026-10-30' })
        .success,
    ).toBe(true);
    expect(
      GenerateContentPlanSchema.safeParse({ startDate: '2026-10-01', endDate: '2026-10-31' })
        .success,
    ).toBe(false);
    expect(
      GenerateContentPlanSchema.safeParse({ startDate: '2026-10-12', endDate: '2026-10-11' })
        .success,
    ).toBe(false);
    expect(
      GenerateContentPlanSchema.safeParse({ startDate: '12/10/2026', endDate: '2026-10-25' })
        .success,
    ).toBe(false);
  });

  it('generar: plataformas del enum, frecuencia acotada, sin workspaceId', () => {
    const base = { startDate: '2026-10-12', endDate: '2026-10-18' };
    expect(GenerateContentPlanSchema.safeParse({ ...base, platforms: ['myspace'] }).success).toBe(
      false,
    );
    expect(GenerateContentPlanSchema.safeParse({ ...base, frequency: 0 }).success).toBe(false);
    expect(
      GenerateContentPlanSchema.safeParse({ ...base, workspaceId: '507f1f77bcf86cd799439011' })
        .success,
    ).toBe(false);
  });

  it('editar propuesta: solo campos editables; recuperar = status proposed', () => {
    expect(UpdateContentPlanItemSchema.safeParse({ title: 'Nuevo' }).success).toBe(true);
    expect(UpdateContentPlanItemSchema.safeParse({ status: 'proposed' }).success).toBe(true);
    expect(UpdateContentPlanItemSchema.safeParse({ status: 'converted' }).success).toBe(false);
    expect(UpdateContentPlanItemSchema.safeParse({ convertedContentItemId: 'x' }).success).toBe(
      false,
    );
    expect(UpdateContentPlanItemSchema.safeParse({}).success).toBe(false);
  });

  it('salida de la IA: estructura cerrada (plataforma, formato y ángulo del enum)', () => {
    const item = {
      title: 'El proceso detrás del videoclip',
      concept: 'Del guion al corte final.',
      rationale: 'Convierte un proyecto real en autoridad.',
      objective: 'Autoridad',
      audience: ['Emprendedores'],
      platform: 'instagram',
      format: 'reel',
      pillar: 'Proceso',
      angle: 'process',
      hook: null,
      suggestedAngle: null,
      suggestedDate: '2026-10-13',
      projectId: null,
    };
    const plan = {
      strategySummary: 'Priorizar proceso y autoridad.',
      pillars: [{ name: 'Proceso', rationale: 'Real.' }],
      items: [item],
    };
    expect(GeneratedContentPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      GeneratedContentPlanSchema.safeParse({ ...plan, items: [{ ...item, platform: 'myspace' }] })
        .success,
    ).toBe(false);
    expect(
      GeneratedContentPlanSchema.safeParse({ ...plan, items: [{ ...item, angle: 'meme' }] })
        .success,
    ).toBe(false);
    expect(GeneratedContentPlanSchema.safeParse({ ...plan, items: [] }).success).toBe(false);
  });
});
