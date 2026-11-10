import { createHash } from 'node:crypto';
import { workspaceSupportsFeature } from '@pixel/contracts';
import { z } from 'zod';
import { isFree, isValidTimezone, overlaps, toSpan } from '../../calendar/availability.js';
import {
  calendarStatus,
  openCalendarSession,
  workspaceEventRef,
  type CalendarDeps,
} from '../../calendar/calendarConnection.service.js';
import {
  CalendarError,
  type CalendarEventSummary,
  type TimeInterval,
} from '../../calendar/calendar.types.js';
import {
  defineCapability,
  type PixelTool,
  type ToolAvailability,
  type ToolExecutionContext,
} from '../action.types.js';

/*
 * google.calendar (Prompt 19, docs/GOOGLE-CALENDAR.md y docs/PIXEL-TOOLS.md). La primera herramienta
 * EXTERNA: solo Personal, solo con la cuenta conectada del dueño del workspace. Sin borrar eventos.
 *
 * - Idempotencia externa: el id del evento se deriva de `ctx.idempotencyKey` (comando, revisión y
 *   acción). Un doble clic, un reintento o una caída después de crear encuentran el MISMO evento.
 *   Nunca se deduplica por título.
 * - Antes de escribir se revalida el hueco con el calendario real: si apareció otro compromiso, la
 *   acción falla con `calendar_conflict` (nunca se mueve a otro hueco por su cuenta).
 * - Solo se mueven eventos de Pixel de ESTE workspace (propiedades privadas, no el título).
 * - Verificar = releer el evento en Google y comparar calendario, título, horas y marca de Pixel.
 */

const DAY_MS = 24 * 60 * 60_000;
const MAX_RANGE_MS = 31 * DAY_MS;
/** Prompt 20: «Mi agenda · Próximos» lee hasta ~1 año (paginado en el adaptador). */
const MAX_LIST_RANGE_MS = 370 * DAY_MS;

const TimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => isValidTimezone(value), 'Zona horaria no válida');

const rangeSchema = (maxMs: number) =>
  z
    .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
    .strict()
    .refine(
      (range) =>
        Date.parse(range.end) > Date.parse(range.start) &&
        Date.parse(range.end) - Date.parse(range.start) <= maxMs,
      'Rango no válido',
    );
const RangeSchema = rangeSchema(MAX_RANGE_MS);
/** list_events: además, solo bloques de Pixel (filtro de Google por la marca privada). */
const ListRangeSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    pixelOnly: z.boolean().optional(),
  })
  .strict()
  .refine(
    (range) =>
      Date.parse(range.end) > Date.parse(range.start) &&
      Date.parse(range.end) - Date.parse(range.start) <= MAX_LIST_RANGE_MS,
    'Rango no válido',
  );
type ListRange = z.output<typeof ListRangeSchema>;
type Range = z.output<typeof RangeSchema>;

const timedRange = <T extends { start: string; end: string }>(value: T) =>
  Date.parse(value.end) > Date.parse(value.start) &&
  Date.parse(value.end) - Date.parse(value.start) <= 12 * 60 * 60_000;

/** Entrada exacta de create_event. El calendario lo decide el servidor (nunca la entrada). */
export const CreateEventInputSchema = z
  .object({
    summary: z.string().trim().min(1).max(200),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    timezone: TimezoneSchema,
    description: z.string().max(1000).optional(),
    location: z.string().max(200).optional(),
    /**
     * Prompt 20: referencia opaca de la tarea que organiza este bloque. La pone el SERVIDOR (desde una
     * tarea validada contra el workspace), nunca el cliente.
     */
    taskRef: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  })
  .strict()
  .refine(timedRange, 'Horario no válido');
export type CreateEventInput = z.output<typeof CreateEventInputSchema>;

/** Google acepta ids de 5 a 1024 caracteres en base32hex (0-9 y a-v): hex es un subconjunto. */
export const EventIdSchema = z.string().regex(/^[0-9a-v]{5,1024}$/);

export const UpdateEventInputSchema = z
  .object({
    eventId: EventIdSchema,
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    timezone: TimezoneSchema,
    summary: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(timedRange, 'Horario no válido');
export type UpdateEventInput = z.output<typeof UpdateEventInputSchema>;

/** Id determinista del evento de una acción (la base de la idempotencia externa). */
export const eventIdFor = (idempotencyKey: string) =>
  createHash('sha256').update(`pixel-calendar-event:${idempotencyKey}`).digest('hex');

/** Referencia opaca de la acción guardada en el evento (no revela el comando). */
export const actionRefFor = (idempotencyKey: string) =>
  createHash('sha256').update(`pixel-action:${idempotencyKey}`).digest('hex').slice(0, 32);

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/** ¿Ocupa tiempo? (cancelado, «disponible» o de todo el día no bloquean un hueco concreto). */
export const occupies = (event: CalendarEventSummary) =>
  !event.cancelled && !event.transparent && !event.allDay;

const ownedByPixel = (event: CalendarEventSummary, ctx: ToolExecutionContext) =>
  event.pixel.managed && event.pixel.workspace === workspaceEventRef(ctx.workspace);

/** Lo que la herramienta expone de un evento: nunca descripciones, invitados ni enlaces. */
export interface CalendarEventView {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  /** Prompt 20: días de un evento de todo el día («YYYY-MM-DD», fin exclusivo); null con hora. */
  startDate: string | null;
  endDate: string | null;
  /** Ocupa tiempo (no cancelado, ni «disponible», ni de todo el día). */
  busy: boolean;
  /** Lo creó Pixel en ESTE workspace (marca privada): el único tipo que Pixel puede mover. */
  pixelOwned: boolean;
  /** Prompt 20: referencia opaca de la tarea que cubre (solo en bloques de este Pixel). */
  pixelTaskRef: string | null;
}

const eventView = (event: CalendarEventSummary, ctx: ToolExecutionContext): CalendarEventView => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  startDate: event.startDate,
  endDate: event.endDate,
  busy: occupies(event),
  pixelOwned: ownedByPixel(event, ctx),
  pixelTaskRef: ownedByPixel(event, ctx) ? event.pixel.task : null,
});

const ref = (event: CalendarEventSummary) => ({
  kind: 'calendar_event' as const,
  id: event.id,
  label: event.title,
});

export function createGoogleCalendarTool(deps: CalendarDeps): PixelTool {
  const session = (ctx: ToolExecutionContext) => openCalendarSession(ctx.workspace, deps);

  const listEvents = defineCapability<ListRange, { events: CalendarEventView[] }>({
    key: 'list_events',
    description: 'Leer los eventos de tu calendario en un rango (solo título y horas).',
    inputSchema: ListRangeSchema,
    effect: 'read',
    target: 'external',
    resourceKind: 'calendar_event',
    sensitive: true,
    async execute(input, ctx) {
      const { pixelOnly, ...range } = input;
      const events = (
        await (await session(ctx)).listEvents(range, { pixelManagedOnly: pixelOnly === true })
      ).filter((e) => !e.cancelled);
      return {
        status: 'success',
        summary: `Leí ${events.length} eventos.`,
        resourceRefs: [],
        output: { events: events.map((event) => eventView(event, ctx)) },
      };
    },
    // Una lectura no cambia nada: lo verificado es que Google respondió.
    verify: async (result) => result.status === 'success',
  });

  const findAvailability = defineCapability<
    Range,
    { busy: TimeInterval[]; timezone: string | null }
  >({
    key: 'find_availability',
    description: 'Consultar cuándo estás ocupado (sin leer el contenido de los eventos).',
    inputSchema: RangeSchema,
    effect: 'read',
    target: 'external',
    resourceKind: 'calendar_event',
    sensitive: true,
    async execute(input, ctx) {
      const calendar = await session(ctx);
      const busy = await calendar.freeBusy(input);
      return {
        status: 'success',
        summary: `Encontré ${busy.length} intervalos ocupados.`,
        resourceRefs: [],
        output: { busy, timezone: calendar.timezone },
      };
    },
    verify: async (result) => result.status === 'success',
  });

  const createEvent = defineCapability<CreateEventInput, { eventId: string }>({
    key: 'create_event',
    description: 'Guardar un bloque en tu Google Calendar.',
    inputSchema: CreateEventInputSchema,
    effect: 'create',
    target: 'external',
    resourceKind: 'calendar_event',
    sensitive: true,
    // No se borra desde Pixel (no hay delete_event): lo reversible lo hace el usuario en Google.
    reversible: false,
    async execute(input, ctx) {
      const calendar = await session(ctx);
      const id = eventIdFor(ctx.idempotencyKey);
      const action = actionRefFor(ctx.idempotencyKey);
      const reuse = (event: CalendarEventSummary) => {
        if (event.cancelled || event.pixel.action !== action) {
          throw new CalendarError('calendar_execution_failed');
        }
        return {
          status: 'success' as const,
          summary: `«${event.title}» ya estaba guardado por esta acción.`,
          resourceRefs: [ref(event)],
          output: { eventId: event.id },
        };
      };
      // 1) ¿Ya lo creó esta misma acción (reintento, doble clic, caída tras crear)?
      const existing = await calendar.getEvent(id);
      if (existing) return reuse(existing);
      // 2) El hueco tiene que seguir libre AHORA (otro compromiso pudo aparecer tras proponer).
      const busy = await calendar.freeBusy({ start: input.start, end: input.end });
      if (!isFree(toSpan(input), busy.map(toSpan))) throw new CalendarError('calendar_conflict');
      // 3) Crear con el id determinista; si otra ejecución ganó la carrera, es el mismo evento.
      let created: CalendarEventSummary;
      try {
        created = await calendar.insertEvent({
          id,
          summary: input.summary,
          start: input.start,
          end: input.end,
          timezone: input.timezone,
          description: input.description ?? 'Bloque creado por Pixel con tu autorización.',
          pixel: {
            workspace: workspaceEventRef(ctx.workspace),
            action,
            task: input.taskRef ?? null,
          },
        });
      } catch (err) {
        if (!(err instanceof CalendarError) || err.code !== 'calendar_duplicate') throw err;
        const winner = await calendar.getEvent(id);
        if (!winner) throw new CalendarError('calendar_execution_failed');
        return reuse(winner);
      }
      return {
        status: 'success',
        summary: `Guardé «${created.title}» en Google Calendar.`,
        resourceRefs: [ref(created)],
        output: { eventId: created.id },
      };
    },
    async verify(result, input, ctx) {
      const event = await (await session(ctx)).getEvent(eventIdFor(ctx.idempotencyKey));
      return Boolean(
        event &&
        result.resourceRefs[0]?.id === event.id &&
        !event.cancelled &&
        event.title === input.summary &&
        sameInstant(event.start, input.start) &&
        sameInstant(event.end, input.end) &&
        ownedByPixel(event, ctx) &&
        event.pixel.action === actionRefFor(ctx.idempotencyKey) &&
        event.pixel.task === (input.taskRef ?? null),
      );
    },
  });

  const updateEvent = defineCapability<UpdateEventInput, { eventId: string }>({
    key: 'update_event',
    description: 'Mover un bloque que Pixel guardó en tu Google Calendar.',
    inputSchema: UpdateEventInputSchema,
    effect: 'update',
    target: 'external',
    resourceKind: 'calendar_event',
    // Cambiar la fecha de un compromiso es significativo: exige la confirmación del plan.
    significant: true,
    sensitive: true,
    reversible: true,
    async execute(input, ctx) {
      const calendar = await session(ctx);
      const event = await calendar.getEvent(input.eventId);
      if (!event || event.cancelled) throw new CalendarError('calendar_event_not_found');
      // Los eventos que no creó Pixel en este workspace son restricciones: nunca se tocan.
      if (!ownedByPixel(event, ctx)) throw new CalendarError('calendar_permission_denied');
      const already = sameInstant(event.start, input.start) && sameInstant(event.end, input.end);
      if (!already) {
        // El hueco nuevo debe estar libre de OTROS eventos (el propio puede solaparse consigo).
        const target = toSpan(input);
        const others = await calendar.listEvents({ start: input.start, end: input.end });
        const clash = others.some(
          (other) => other.id !== event.id && occupies(other) && overlaps(toSpan(other), target),
        );
        if (clash) throw new CalendarError('calendar_conflict');
        await calendar.patchEvent(event.id, {
          start: input.start,
          end: input.end,
          timezone: input.timezone,
          ...(input.summary ? { summary: input.summary } : {}),
        });
      }
      return {
        status: 'success',
        summary: already
          ? `«${event.title}» ya estaba en ese horario.`
          : `Moví «${input.summary ?? event.title}» en Google Calendar.`,
        resourceRefs: [{ ...ref(event), label: input.summary ?? event.title }],
        output: { eventId: event.id },
      };
    },
    async verify(result, input, ctx) {
      const event = await (await session(ctx)).getEvent(input.eventId);
      return Boolean(
        event &&
        result.resourceRefs[0]?.id === event.id &&
        !event.cancelled &&
        ownedByPixel(event, ctx) &&
        sameInstant(event.start, input.start) &&
        sameInstant(event.end, input.end) &&
        (!input.summary || event.title === input.summary),
      );
    },
  });

  return {
    key: 'google.calendar',
    name: 'Google Calendar',
    description: 'Tu Google Calendar: disponibilidad y los bloques que apruebes.',
    contextTypes: ['personal'],
    feature: 'calendar',
    capabilities: [listEvents, findAvailability, createEvent, updateEvent],
    async availability({ workspace }): Promise<ToolAvailability> {
      if (!workspaceSupportsFeature(workspace.type, 'calendar')) return 'unavailable';
      const status = await calendarStatus(workspace, deps);
      return status === 'connected' ? 'available' : status;
    },
  };
}
