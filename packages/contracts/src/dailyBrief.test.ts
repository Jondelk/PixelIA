import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  DailyBriefGenerationSchema,
  isValidTimezone,
  localDateIn,
  UpdateWorkspaceSchema,
} from './index.js';

describe('Zona horaria', () => {
  it('valida IANA y calcula el día local (no UTC)', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true);
    expect(isValidTimezone('Marte/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    const instant = new Date('2026-10-09T02:00:00.000Z');
    expect(localDateIn(instant, 'America/Bogota')).toBe('2026-10-08');
    expect(localDateIn(instant, 'UTC')).toBe('2026-10-09');
    expect(daysBetween('2026-10-08', '2026-10-10')).toBe(2);
  });

  it('el workspace acepta una zona IANA explícita (o null)', () => {
    expect(UpdateWorkspaceSchema.safeParse({ timezone: 'Europe/Madrid' }).success).toBe(true);
    expect(UpdateWorkspaceSchema.safeParse({ timezone: null }).success).toBe(true);
    expect(UpdateWorkspaceSchema.safeParse({ timezone: 'Bogotá' }).success).toBe(false);
  });
});

describe('Salida de la IA del Daily Director', () => {
  const base = {
    summary: 'Hoy tienes una entrega cercana y una tarea vencida.',
    priorities: [
      { ref: 'TASK_1', rationale: 'Vence mañana y es de alta prioridad.', suggestedAction: null },
    ],
    contentSuggestion: null,
    focusBlocks: [{ title: 'Edición', objective: 'Cerrar el corte', ref: 'TASK_1' }],
    closingNote: null,
  };

  it('solo referencias controladas; títulos, urgencias y minutos no vienen de la IA', () => {
    expect(DailyBriefGenerationSchema.safeParse(base).success).toBe(true);
    const parsed = DailyBriefGenerationSchema.parse({
      ...base,
      priorities: [{ ...base.priorities[0], urgency: 'critical', title: 'Inventada' }],
    });
    expect(parsed.priorities[0]).not.toHaveProperty('urgency');
    expect(parsed.priorities[0]).not.toHaveProperty('title');
  });

  it('máximo 3 prioridades y 4 bloques; rationale con contenido', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({
      ...base.priorities[0],
      ref: `TASK_${i + 1}`,
    }));
    expect(DailyBriefGenerationSchema.safeParse({ ...base, priorities: many }).success).toBe(false);
    expect(
      DailyBriefGenerationSchema.safeParse({
        ...base,
        focusBlocks: Array(5).fill(base.focusBlocks[0]),
      }).success,
    ).toBe(false);
    expect(
      DailyBriefGenerationSchema.safeParse({
        ...base,
        priorities: [{ ref: 'TASK_1', rationale: 'Ok', suggestedAction: null }],
      }).success,
    ).toBe(false);
  });
});
