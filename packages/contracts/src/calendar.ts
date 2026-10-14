import { z } from 'zod';
import { IsoDateSchema } from './common.js';

/*
 * Google Calendar + planificador de la semana (Prompt 19, docs/GOOGLE-CALENDAR.md y
 * docs/PERSONAL-WEEK-PLANNER.md). Solo Personal. Aquí solo hay lo que viaja por la API: el estado
 * de la conexión (nunca credenciales), la vista humana de un plan de la semana y la salida
 * estructurada que puede devolver un intérprete de IA (que el backend valida).
 */

/**
 * Estado de Google Calendar para un Pixel Personal:
 * - unconfigured: esta instalación no tiene credenciales de Google (no se ofrece OAuth);
 * - requires_auth: la instalación sí, pero el usuario aún no conectó su cuenta;
 * - connected: conexión válida;
 * - requires_reauth: había conexión y dejó de ser válida (revocada o caducada);
 * - unavailable: error temporal de Google u otra condición real.
 */
export const CalendarConnectionStatusSchema = z.enum([
  'unconfigured',
  'requires_auth',
  'connected',
  'requires_reauth',
  'unavailable',
]);
export type CalendarConnectionStatus = z.infer<typeof CalendarConnectionStatusSchema>;

/** GET …/calendar/connection. Sin tokens, sin código, sin secretos. */
export const CalendarConnectionSchema = z.object({
  provider: z.literal('google'),
  status: CalendarConnectionStatusSchema,
  connected: z.boolean(),
  /** Qué puede hacer Pixel con la conexión, en lenguaje humano. */
  scopes: z.array(z.string()),
  timezone: z.string().nullable(),
  /** Nombre del calendario (sin correo ni datos personales). */
  accountLabel: z.string().nullable(),
  connectedAt: IsoDateSchema.nullable(),
});
export type CalendarConnection = z.infer<typeof CalendarConnectionSchema>;

export const CalendarConnectionResponseSchema = z.object({ connection: CalendarConnectionSchema });
export type CalendarConnectionResponse = z.infer<typeof CalendarConnectionResponseSchema>;

/**
 * POST …/calendar/connect. `returnTo` es una pantalla INTERNA de una lista cerrada (nunca una URL):
 * el servidor construye la ruta de vuelta del mismo workspace.
 */
export const StartCalendarConnectSchema = z
  .object({ returnTo: z.enum(['home', 'pixel']).default('pixel') })
  .strict();
export type StartCalendarConnectInput = z.input<typeof StartCalendarConnectSchema>;

export const StartCalendarConnectResponseSchema = z.object({ authUrl: z.string().url() });
export type StartCalendarConnectResponse = z.infer<typeof StartCalendarConnectResponseSchema>;

/* ---------- Plan de la semana (vista humana) ---------- */

export const WeekPlanBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: IsoDateSchema,
  end: IsoDateSchema,
  /** «Lunes 20 de oct.» y «4:00–5:30 p. m.» en la zona del plan. */
  dayLabel: z.string(),
  timeLabel: z.string(),
  /** La duración la estimó Pixel (no la dijo el usuario). */
  estimated: z.boolean(),
  reason: z.string().nullable(),
});
export type WeekPlanBlock = z.infer<typeof WeekPlanBlockSchema>;

export const WeekPlanViewSchema = z.object({
  timezone: z.string(),
  rangeStart: IsoDateSchema,
  rangeEnd: IsoDateSchema,
  /** Cuándo se consultó la disponibilidad real (se vuelve a comprobar antes de guardar). */
  availabilityCheckedAt: IsoDateSchema,
  blocks: z.array(WeekPlanBlockSchema),
  /** Lo que no cupo, y por qué. */
  unscheduled: z.array(z.object({ title: z.string(), reason: z.string() })),
  /** Supuestos visibles (ventana horaria provisional, duración estimada…). */
  assumptions: z.array(z.string()),
  /** Compromisos que Pixel respetó (cuántos y algunos ejemplos, sin detalles privados). */
  fixedCommitments: z.number().int().min(0),
});
export type WeekPlanView = z.infer<typeof WeekPlanViewSchema>;

/* ---------- Salida estructurada del intérprete de planificación (IA) ---------- */

export const PLANNING_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type PlanningWeekday = (typeof PLANNING_WEEKDAYS)[number];

/**
 * Lo que la IA (o las reglas) entendieron de «organízame la semana». Solo lenguaje: el backend
 * calcula fechas reales en la zona del usuario, la disponibilidad y los solapes, y descarta lo que
 * quede fuera del horizonte. La IA nunca ve tokens ni ids de eventos.
 */
export const GeneratedWeekPlanningSchema = z.object({
  horizon: z.enum(['this_week', 'next_week', 'next_7_days']),
  /** Compromisos que el usuario mencionó («el miércoles tengo una reunión familiar»). */
  commitments: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        day: z.enum(PLANNING_WEEKDAYS).nullable().default(null),
        /** Hora local «HH:mm» si la dijo. */
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable()
          .default(null),
        /** Es una fecha límite (parcial, entrega): el trabajo relacionado acaba antes. */
        isDeadline: z.boolean().default(false),
      }),
    )
    .max(10)
    .default([]),
  /** Sesiones a programar («estudiar tres veces»). */
  sessions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        count: z.number().int().min(1).max(10),
        /** Minutos, solo si el usuario lo dijo. */
        durationMinutes: z.number().int().min(15).max(240).nullable().default(null),
        /** Día y hora pedidos para una sola sesión («mañana a las 3»). */
        day: z.enum(PLANNING_WEEKDAYS).nullable().default(null),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable()
          .default(null),
      }),
    )
    .max(10)
    .default([]),
  /** Ventana horaria que dijo el usuario («después de las 6», «hasta las 8»), en horas locales. */
  window: z
    .object({
      startHour: z.number().int().min(0).max(23).nullable().default(null),
      endHour: z.number().int().min(1).max(24).nullable().default(null),
    })
    .default({ startHour: null, endHour: null }),
  avoidDays: z.array(z.enum(PLANNING_WEEKDAYS)).max(7).default([]),
  clarificationNeeded: z.string().trim().max(300).nullable().default(null),
});
export type GeneratedWeekPlanning = z.infer<typeof GeneratedWeekPlanningSchema>;
