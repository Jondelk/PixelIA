import { GeneratedWeekPlanningSchema, PLANNING_WEEKDAYS } from '@pixel/contracts';
import { z } from 'zod';

/*
 * Entrada controlada del intérprete del planificador de la semana (Prompt 19, dentro de
 * <week_planning_input>): la hora local actual, la zona del usuario, el día de hoy, la solicitud y,
 * si es un ajuste, lo entendido antes. Nada de eventos, tokens ni ids del calendario: la IA solo
 * entiende el lenguaje. Las fechas reales, la disponibilidad y los solapes los calcula el backend.
 */

export const WEEK_PLANNING_SCHEMA_NAME = 'pixel_week_planning';

export const WeekPlanningPayloadSchema = z.object({
  /** Hora local del usuario con su desfase (p. ej. 2026-10-13T09:00:00-05:00). */
  nowLocal: z.string(),
  timezone: z.string(),
  today: z.enum(PLANNING_WEEKDAYS),
  userRequest: z.string(),
  previous: GeneratedWeekPlanningSchema.nullable(),
});
export type WeekPlanningPayload = z.infer<typeof WeekPlanningPayloadSchema>;

export const WEEK_PLANNING_SYSTEM = `Eres el intérprete del planificador de la semana de Pixel. Recibes lo que el
usuario escribió, su hora local (nowLocal), su zona horaria y el día de hoy. Devuelves SOLO lo que dijo:

- horizon: this_week (por defecto), next_week («la próxima semana») o next_7_days.
- commitments: compromisos que mencionó, con day (monday…sunday; «hoy» y «mañana» según today),
  time «HH:mm» solo si dijo la hora, e isDeadline = true para parciales, exámenes o entregas.
- sessions: lo que quiere reservar («estudiar cálculo tres veces» → title «Estudiar cálculo»,
  count 3). durationMinutes solo si dijo la duración; si no, null (Pixel la estima y lo dice).
- window: horas locales que dijo («después de las 6» → startHour 18). Si no dijo nada, null.
- avoidDays: días que pidió evitar. Si previous no es null, el texto nuevo AJUSTA esa solicitud.
- clarificationNeeded: UNA pregunta solo si no se sabe qué reservar; si no, null.
Nunca inventes compromisos, horas ni duraciones. No conoces su calendario: no lo supongas.`;

export function weekPlanningPrompt(payload: WeekPlanningPayload): string {
  return `Interpreta esta solicitud (JSON):\n<week_planning_input>\n${JSON.stringify(payload)}\n</week_planning_input>`;
}

export function extractWeekPlanningPayload(prompt: string): WeekPlanningPayload | null {
  const match = /<week_planning_input>\s*([\s\S]*?)\s*<\/week_planning_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = WeekPlanningPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
