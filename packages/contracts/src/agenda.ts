import { z } from 'zod';
import { CalendarConnectionStatusSchema } from './calendar.js';
import { IsoDateSchema } from './common.js';

/*
 * «Mi agenda» (Prompt 20, docs/PERSONAL-AGENDA.md): la vista unificada del tiempo de un Pixel
 * Personal. SOLO lectura: Google Calendar (on demand, nunca copiado), los bloques que organizó Pixel,
 * las tareas con fecha y las fechas límite de proyectos. Los cambios siguen por PixelCommand →
 * propuesta → confirmación → Action Foundation.
 *
 * El backend calcula fechas, días y etiquetas en la zona del usuario: la web solo pinta.
 */

export const AGENDA_VIEWS = ['today', 'week', 'month', 'upcoming'] as const;
export const AgendaViewKindSchema = z.enum(AGENDA_VIEWS);
export type AgendaViewKind = z.infer<typeof AgendaViewKindSchema>;

/** Día local «YYYY-MM-DD». */
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const AGENDA_UPCOMING_DEFAULT_DAYS = 90;
export const AGENDA_UPCOMING_MAX_DAYS = 360;

/** GET …/agenda. Parámetros controlados: ningún calendario, usuario ni workspace del cliente. */
export const AgendaQuerySchema = z
  .object({
    view: AgendaViewKindSchema.default('today'),
    /** Día de referencia (hoy si falta): el día, su semana o su mes. */
    anchor: LocalDateSchema.optional(),
    /** Solo Próximos: días hacia delante (30–360, «Ver más» suma 90). */
    horizon: z.coerce
      .number()
      .int()
      .min(30)
      .max(AGENDA_UPCOMING_MAX_DAYS)
      .default(AGENDA_UPCOMING_DEFAULT_DAYS),
    /**
     * Zona IANA del navegador: solo el último recurso, con la misma prioridad que el planificador
     * (la del Pixel → la del Google Calendar → esta). La API la valida.
     */
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type AgendaQuery = z.input<typeof AgendaQuerySchema>;

/**
 * Tipos visibles:
 * - commitment: un evento de tu calendario que Pixel respeta (no lo mueve);
 * - pixel_block: un bloque que organizó Pixel (se puede replanificar con Pixel);
 * - pending: una tarea con fecha que aún no tiene un bloque de tiempo;
 * - deadline: la fecha límite de un proyecto (sin duración inventada).
 */
export const AgendaItemKindSchema = z.enum(['commitment', 'pixel_block', 'pending', 'deadline']);
export type AgendaItemKind = z.infer<typeof AgendaItemKindSchema>;

export const AgendaItemStatusSchema = z.enum([
  'past',
  'now',
  'upcoming',
  'due_today',
  'overdue',
  'due',
]);
export type AgendaItemStatus = z.infer<typeof AgendaItemStatusSchema>;

export const AgendaItemSchema = z.object({
  /** Referencia opaca (nunca el id del proveedor). */
  id: z.string(),
  kind: AgendaItemKindSchema,
  /** «Compromiso», «Organizado por Pixel», «Por organizar», «Fecha límite». */
  kindLabel: z.string(),
  title: z.string(),
  start: IsoDateSchema.nullable(),
  end: IsoDateSchema.nullable(),
  /** Primer y último día local que ocupa (incluido). */
  date: LocalDateSchema,
  endDate: LocalDateSchema,
  /** Días locales del rango pedido que cubre (para pintar sin calcular fechas en la web). */
  dates: z.array(LocalDateSchema),
  allDay: z.boolean(),
  multiDay: z.boolean(),
  /** «08:00–09:30», «Todo el día» o null (una fecha límite). */
  timeLabel: z.string().nullable(),
  /** «Miércoles 21 de octubre» (o el rango si dura varios días). */
  dayLabel: z.string(),
  status: AgendaItemStatusSchema,
  /** «Vence hoy», «Vencida · por organizar», «Vence el 23 oct.»… */
  statusLabel: z.string().nullable(),
  pixelManaged: z.boolean(),
  /** Pixel puede proponer moverlo (solo sus bloques de este Pixel). */
  movableByPixel: z.boolean(),
  deadline: z.boolean(),
  /** Enlace a un recurso de Pixel (tarea o proyecto de ESTE workspace). */
  link: z.object({ type: z.enum(['task', 'project']), id: z.string() }).nullable(),
  /** Próximos: el grupo («Esta semana», «Noviembre», «Más adelante»). */
  group: z.string().nullable(),
});
export type AgendaItem = z.infer<typeof AgendaItemSchema>;

export const AgendaDaySchema = z.object({
  date: LocalDateSchema,
  /** «Miércoles 21 de octubre». */
  label: z.string(),
  /** «Mié 21». */
  shortLabel: z.string(),
  dayNumber: z.number().int(),
  /** 1 = lunes … 7 = domingo. */
  weekday: z.number().int().min(1).max(7),
  isToday: z.boolean(),
  isPast: z.boolean(),
  /** Mes: los días de relleno de otros meses van con inRange = false. */
  inRange: z.boolean(),
});
export type AgendaDay = z.infer<typeof AgendaDaySchema>;

export const AgendaResponseSchema = z.object({
  agenda: z.object({
    timezone: z.string(),
    view: AgendaViewKindSchema,
    anchor: LocalDateSchema,
    today: LocalDateSchema,
    range: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
    /** «Hoy · viernes 17 de octubre», «Semana del 12 al 18 de octubre», «Octubre 2026»… */
    title: z.string(),
    /** Anclas para «anterior», «siguiente» y «Hoy» (null si la vista no navega). */
    navigation: z.object({
      previous: LocalDateSchema.nullable(),
      next: LocalDateSchema.nullable(),
      today: LocalDateSchema,
    }),
    /** Interpretación breve y determinista (sin IA). */
    summary: z.string(),
    counts: z.object({
      commitments: z.number().int(),
      pixelBlocks: z.number().int(),
      pending: z.number().int(),
      deadlines: z.number().int(),
    }),
    days: z.array(AgendaDaySchema),
    items: z.array(AgendaItemSchema),
    /** Tareas con fecha (o vencidas) que aún no tienen tiempo reservado. */
    pendingItems: z.array(AgendaItemSchema),
    /** Próximos: los grupos en orden. */
    groups: z.array(z.string()),
    connection: z.object({
      status: CalendarConnectionStatusSchema,
      /** Aviso humano si los compromisos de Google no están incluidos o no se actualizaron. */
      message: z.string().nullable(),
    }),
    horizonDays: z.number().int().nullable(),
    /** Próximos: se puede ampliar el horizonte («Ver más»). */
    canExtend: z.boolean(),
    generatedAt: IsoDateSchema,
  }),
});
export type AgendaResponse = z.infer<typeof AgendaResponseSchema>;
export type AgendaView = AgendaResponse['agenda'];
