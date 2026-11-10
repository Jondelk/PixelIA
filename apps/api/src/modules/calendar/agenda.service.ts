import { createHash } from 'node:crypto';
import {
  AGENDA_UPCOMING_MAX_DAYS,
  AgendaQuerySchema,
  localDateIn,
  type AgendaDay,
  type AgendaItem,
  type AgendaQuery,
  type AgendaView,
  type CalendarConnectionStatus,
} from '@pixel/contracts';
import { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { CalendarEventView } from '../actions/tools/googleCalendar.tool.js';
import { errorCodeOf } from '../actions/action.executor.js';
import { ProjectModel } from '../operations/project.model.js';
import { taskEventRef } from './calendarConnection.service.js';
import { TaskModel } from '../operations/task.model.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  anchorDay,
  eachLocalDay,
  monthRange,
  todayRange,
  upcomingRange,
  weekRange,
  type LocalRange,
} from './availability.js';
import {
  planningTimezone,
  readCalendar,
  type CalendarPlanningDeps,
} from './weekPlanning.service.js';

/*
 * PersonalAgendaService (Prompt 20, docs/PERSONAL-AGENDA.md): el modelo de lectura de «Mi agenda».
 *
 *   rango (zona del usuario) → fuentes (Google por la herramienta, tareas y proyectos de ESTE
 *   workspace) → AgendaItem normalizados → orden → días, grupos, resumen y aviso de conexión.
 *
 * Solo lee. No guarda nada de Google, no llama a la IA y no escribe: cambiar la agenda es una
 * propuesta de PixelCommand. Si Google falla, la agenda interna sigue (estado parcial).
 */

export interface AgendaDeps extends CalendarPlanningDeps {
  defaultTimezone: string;
}

const OPEN_TASKS = ['inbox', 'todo', 'doing'] as const;
const OPEN_PROJECTS = ['planned', 'active', 'on_hold'] as const;
const MAX_ROWS = 300;

const KIND_LABEL: Record<AgendaItem['kind'], string> = {
  commitment: 'Compromiso',
  pixel_block: 'Organizado por Pixel',
  pending: 'Por organizar',
  deadline: 'Fecha límite',
};

const CONNECTION_COPY: Partial<Record<CalendarConnectionStatus, string>> = {
  unconfigured:
    'Google Calendar no está configurado en esta instalación: tu agenda muestra solo lo que organizas en Pixel.',
  requires_auth: 'Conecta Google Calendar para incluir tus compromisos reales.',
  requires_reauth: 'Necesito volver a conectar Google Calendar para actualizar tu agenda.',
  unavailable:
    'No pude actualizar tus compromisos de Google en este momento. Tu agenda interna sigue disponible.',
};

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
const es = (day: DateTime) => day.setLocale('es');
const dayLabelOf = (day: DateTime) => capitalize(es(day).toFormat("cccc d 'de' LLLL"));
const shortDay = (day: DateTime) => es(day).toFormat('d LLL').replace('.', '');
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Referencia opaca de un evento externo: nunca el id del proveedor en la web. */
const opaqueEventRef = (workspace: WorkspaceDocument, eventId: string) =>
  `evt_${createHash('sha256').update(`${workspace._id.toString()}:${eventId}`).digest('hex').slice(0, 20)}`;

interface Window {
  range: LocalRange;
  title: string;
  previous: string | null;
  next: string | null;
  days: AgendaDay[];
}

function dayOf(date: string, timezone: string, today: string, inRange: boolean): AgendaDay {
  const day = DateTime.fromISO(date, { zone: timezone });
  return {
    date,
    label: dayLabelOf(day),
    shortLabel: capitalize(es(day).toFormat('ccc d').replace('.', '')),
    dayNumber: day.day,
    weekday: day.weekday,
    isToday: date === today,
    isPast: date < today,
    inRange,
  };
}

function windowFor(
  view: AgendaView['view'],
  anchor: DateTime,
  now: Date,
  timezone: string,
  horizon: number,
  today: string,
): Window {
  const days = (range: LocalRange, from = range.startDate, to = range.endDate) =>
    eachLocalDay(from, to, timezone).map((date) =>
      dayOf(date, timezone, today, date >= range.startDate && date <= range.endDate),
    );
  if (view === 'today') {
    const range = todayRange(anchor);
    return {
      range,
      title: `${anchor.toISODate() === today ? 'Hoy · ' : ''}${dayLabelOf(anchor)}`,
      previous: anchor.minus({ days: 1 }).toISODate(),
      next: anchor.plus({ days: 1 }).toISODate(),
      days: days(range),
    };
  }
  if (view === 'week') {
    const range = weekRange(anchor);
    const first = DateTime.fromISO(range.startDate, { zone: timezone });
    const last = DateTime.fromISO(range.endDate, { zone: timezone });
    const title =
      first.month === last.month
        ? `Semana del ${first.day} al ${last.day} de ${es(last).toFormat('LLLL')}`
        : `Semana del ${shortDay(first)} al ${shortDay(last)}`;
    return {
      range,
      title,
      previous: first.minus({ weeks: 1 }).toISODate(),
      next: first.plus({ weeks: 1 }).toISODate(),
      days: days(range),
    };
  }
  if (view === 'month') {
    const range = monthRange(anchor);
    const first = DateTime.fromISO(range.startDate, { zone: timezone });
    const last = DateTime.fromISO(range.endDate, { zone: timezone });
    // La cuadrícula llena semanas completas (lunes a domingo); el relleno no es del mes.
    return {
      range,
      title: capitalize(es(first).toFormat('LLLL yyyy')),
      previous: first.minus({ months: 1 }).toISODate(),
      next: first.plus({ months: 1 }).toISODate(),
      days: days(range, first.startOf('week').toISODate()!, last.endOf('week').toISODate()!),
    };
  }
  const range = upcomingRange(now, timezone, horizon);
  return { range, title: `Próximos ${horizon} días`, previous: null, next: null, days: [] };
}

interface Draft extends Omit<AgendaItem, 'dates' | 'group' | 'kindLabel'> {
  sortKey: number;
}

/** Evento de Google → compromiso o bloque de Pixel (solo lo que la herramienta expone). */
function fromEvent(
  event: CalendarEventView,
  workspace: WorkspaceDocument,
  timezone: string,
  now: number,
): Draft | null {
  const kind = event.pixelOwned ? 'pixel_block' : 'commitment';
  if (event.allDay) {
    if (!event.startDate) return null;
    const first = DateTime.fromISO(event.startDate, { zone: timezone });
    const last = event.endDate
      ? DateTime.fromISO(event.endDate, { zone: timezone }).minus({ days: 1 })
      : first;
    const endDay = last < first ? first : last;
    const multiDay = endDay > first;
    const start = first.toMillis();
    const end = endDay.plus({ days: 1 }).toMillis();
    return {
      id: opaqueEventRef(workspace, event.id),
      kind,
      title: event.title,
      start: null,
      end: null,
      date: first.toISODate()!,
      endDate: endDay.toISODate()!,
      allDay: true,
      multiDay,
      timeLabel: 'Todo el día',
      dayLabel: multiDay ? rangeLabel(first, endDay) : dayLabelOf(first),
      status: end <= now ? 'past' : start <= now ? 'now' : 'upcoming',
      statusLabel: null,
      pixelManaged: event.pixelOwned,
      movableByPixel: event.pixelOwned,
      deadline: false,
      link: null,
      sortKey: start,
    };
  }
  const start = DateTime.fromISO(event.start, { zone: timezone });
  const end = DateTime.fromISO(event.end, { zone: timezone });
  const lastDay = end.minus({ milliseconds: 1 });
  const multiDay = lastDay.toISODate() !== start.toISODate();
  return {
    id: opaqueEventRef(workspace, event.id),
    kind,
    title: event.title,
    start: start.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    date: start.toISODate()!,
    endDate: (lastDay < start ? start : lastDay).toISODate()!,
    allDay: false,
    multiDay,
    timeLabel: multiDay
      ? `${start.toFormat('HH:mm')} → ${capitalize(es(end).toFormat('ccc d').replace('.', ''))} ${end.toFormat('HH:mm')}`
      : `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`,
    dayLabel: multiDay ? rangeLabel(start, lastDay) : dayLabelOf(start),
    status: end.toMillis() <= now ? 'past' : start.toMillis() <= now ? 'now' : 'upcoming',
    statusLabel: null,
    pixelManaged: event.pixelOwned,
    movableByPixel: event.pixelOwned,
    deadline: false,
    link: null,
    sortKey: start.toMillis(),
  };
}

function rangeLabel(first: DateTime, last: DateTime): string {
  return first.month === last.month
    ? `${first.day}–${last.day} de ${es(last).toFormat('LLLL')}`
    : `${shortDay(first)} – ${shortDay(last)}`;
}

/** Una fecha de vencimiento: día local (sin hora inventada) y su estado. */
function dueOf(date: Date, timezone: string, today: string) {
  const local = localDateIn(date, timezone);
  const day = DateTime.fromISO(local, { zone: timezone });
  const status: AgendaItem['status'] =
    local < today ? 'overdue' : local === today ? 'due_today' : 'due';
  return { local, day, status };
}

const dueLabel = (status: AgendaItem['status'], day: DateTime, pending: boolean) =>
  status === 'overdue'
    ? pending
      ? 'Vencida · por organizar'
      : 'Vencida'
    : status === 'due_today'
      ? 'Vence hoy'
      : `Vence el ${shortDay(day)}`;

export async function buildAgenda(
  workspace: WorkspaceDocument,
  raw: AgendaQuery,
  deps: AgendaDeps,
): Promise<AgendaView> {
  const query = AgendaQuerySchema.parse(raw);
  const now = deps.calendar.now();
  // La misma zona que el planificador (Pixel → Google Calendar → navegador); sin ninguna, la
  // configurada por defecto de la instalación (nunca la del sistema operativo).
  const timezone =
    (await planningTimezone(workspace, query.timezone ?? null, deps)) ?? deps.defaultTimezone;
  const today = localDateIn(now, timezone);
  const anchor = anchorDay(query.anchor, now, timezone);
  const horizon = Math.min(query.horizon, AGENDA_UPCOMING_MAX_DAYS);
  const window = windowFor(query.view, anchor, now, timezone, horizon, today);
  const { range } = window;
  const nowMs = now.getTime();
  const rangeIso = {
    start: new Date(range.start).toISOString(),
    end: new Date(range.end).toISOString(),
  };

  // 1) Google Calendar (on demand, por la herramienta). Un fallo no destruye la agenda.
  const availability = await deps.tools.availability('google.calendar', workspace);
  let status: CalendarConnectionStatus =
    availability === 'available'
      ? 'connected'
      : availability === 'requires_auth' || availability === 'disconnected'
        ? 'requires_auth'
        : availability === 'requires_reauth'
          ? 'requires_reauth'
          : availability === 'unconfigured' || availability === 'not_registered'
            ? 'unconfigured'
            : 'unavailable';
  let events: CalendarEventView[] = [];
  if (status === 'connected') {
    try {
      events = (
        await readCalendar<{ events: CalendarEventView[] }>(
          workspace,
          'list_events',
          rangeIso,
          deps,
        )
      ).events;
    } catch (err) {
      const code = errorCodeOf(err);
      status =
        code === 'calendar_requires_reauth' || code === 'requires_reauth'
          ? 'requires_reauth'
          : 'unavailable';
      deps.logger.warn('agenda.calendar_read_failed', {
        workspaceId: workspace._id.toString(),
        code,
      });
    }
  }

  // 2) Fuentes internas de ESTE workspace: tareas abiertas con fecha y fechas límite de proyectos.
  const includeOverdue = query.view === 'today' || query.view === 'upcoming';
  const dueFilter = includeOverdue
    ? { $ne: null, $lt: new Date(range.end) }
    : { $gte: new Date(range.start), $lt: new Date(range.end) };
  const [tasks, projects] = await Promise.all([
    TaskModel.find({ workspaceId: workspace._id, status: { $in: OPEN_TASKS }, dueDate: dueFilter })
      .select({ title: 1, dueDate: 1, status: 1 })
      .sort({ dueDate: 1 })
      .limit(MAX_ROWS)
      .lean(),
    ProjectModel.find({
      workspaceId: workspace._id,
      status: { $in: OPEN_PROJECTS },
      dueDate: dueFilter,
    })
      .select({ name: 1, dueDate: 1 })
      .sort({ dueDate: 1 })
      .limit(MAX_ROWS)
      .lean(),
  ]);

  // 2b) Prompt 20: ¿qué tareas ya tienen tiempo reservado? Un bloque de Pixel de ESTE workspace con
  // la referencia opaca de la tarea (marca privada), que aún no ha terminado. Nunca por el título.
  // Se lee de Google en el momento: si el bloque ya no existe, la tarea vuelve a «Por organizar».
  const refOf = new Map(
    tasks.map((task) => [taskEventRef(workspace, (task._id as Types.ObjectId).toString()), task]),
  );
  const covering = new Map<string, number>();
  const cover = (event: CalendarEventView) => {
    if (!event.pixelOwned || !event.pixelTaskRef || Date.parse(event.end) <= nowMs) return;
    covering.set(event.pixelTaskRef, (covering.get(event.pixelTaskRef) ?? 0) + 1);
  };
  events.forEach(cover);
  if (status === 'connected' && tasks.length) {
    const latestDue = Math.max(
      range.end,
      ...tasks.map((task) => task.dueDate!.getTime() + 86_400_000),
    );
    const until = Math.min(latestDue, nowMs + 365 * 86_400_000);
    if (until > nowMs) {
      try {
        const blocks = await readCalendar<{ events: CalendarEventView[] }>(
          workspace,
          'list_events',
          {
            start: new Date(nowMs).toISOString(),
            end: new Date(until).toISOString(),
            pixelOnly: true,
          },
          deps,
        );
        // Sin contar dos veces los que ya venían en la lectura del rango.
        const seen = new Set(events.map((event) => event.id));
        blocks.events.filter((event) => !seen.has(event.id)).forEach(cover);
      } catch (err) {
        // Sin esa lectura no se sabe si están cubiertas: siguen «Por organizar» (nunca se inventa).
        deps.logger.warn('agenda.coverage_read_failed', { code: errorCodeOf(err) });
      }
    }
  }

  const drafts: Draft[] = events
    .map((event) => {
      const draft = fromEvent(event, workspace, timezone, nowMs);
      // El bloque de Pixel enlaza con la tarea que organiza (si es una tarea de este workspace).
      const task = event.pixelTaskRef ? refOf.get(event.pixelTaskRef) : undefined;
      return draft && task && draft.kind === 'pixel_block'
        ? { ...draft, link: { type: 'task' as const, id: (task._id as Types.ObjectId).toString() } }
        : draft;
    })
    .filter((item): item is Draft => item !== null);
  const pendingDrafts: Draft[] = [];
  for (const task of tasks) {
    // Organizada (con tiempo reservado en uno o varios bloques): no es «Por organizar». Sigue
    // pendiente: programar no es completar.
    if (covering.has(taskEventRef(workspace, (task._id as Types.ObjectId).toString()))) continue;
    const due = dueOf(task.dueDate!, timezone, today);
    pendingDrafts.push({
      id: `task_${(task._id as Types.ObjectId).toString()}`,
      kind: 'pending',
      title: task.title,
      start: null,
      end: null,
      // Una vencida se muestra HOY en Hoy y Próximos (sin inventarle horario); en Semana y Mes, en su
      // día real, marcada como vencida.
      date: due.status === 'overdue' && includeOverdue ? today : due.local,
      endDate: due.status === 'overdue' && includeOverdue ? today : due.local,
      allDay: false,
      multiDay: false,
      timeLabel: null,
      dayLabel: dayLabelOf(due.day),
      status: due.status,
      statusLabel: dueLabel(due.status, due.day, true),
      pixelManaged: false,
      movableByPixel: false,
      deadline: true,
      link: { type: 'task', id: (task._id as Types.ObjectId).toString() },
      sortKey: due.day.toMillis(),
    });
  }
  for (const project of projects) {
    const due = dueOf(project.dueDate!, timezone, today);
    drafts.push({
      id: `project_${(project._id as Types.ObjectId).toString()}`,
      kind: 'deadline',
      title: project.name,
      start: null,
      end: null,
      date: due.status === 'overdue' && includeOverdue ? today : due.local,
      endDate: due.status === 'overdue' && includeOverdue ? today : due.local,
      allDay: true,
      multiDay: false,
      timeLabel: null,
      dayLabel: dayLabelOf(due.day),
      status: due.status,
      statusLabel: dueLabel(due.status, due.day, false),
      pixelManaged: false,
      movableByPixel: false,
      deadline: true,
      link: { type: 'project', id: (project._id as Types.ObjectId).toString() },
      sortKey: due.day.toMillis(),
    });
  }

  // 3) Normalizar: días cubiertos dentro del rango, grupo (Próximos) y orden estable.
  const groupOf = groupFor(query.view, today, timezone);
  const finish = ({ sortKey: _sortKey, ...draft }: Draft): AgendaItem => ({
    ...draft,
    kindLabel: KIND_LABEL[draft.kind],
    dates: eachLocalDay(
      draft.date < range.startDate ? range.startDate : draft.date,
      draft.endDate > range.endDate ? range.endDate : draft.endDate,
      timezone,
    ),
    group: groupOf(draft),
  });
  const order = (a: Draft, b: Draft) =>
    a.date.localeCompare(b.date) ||
    Number(b.allDay || b.deadline) - Number(a.allDay || a.deadline) ||
    a.sortKey - b.sortKey ||
    a.title.localeCompare(b.title, 'es');
  const items = drafts.sort(order).map(finish);
  const pendingItems = pendingDrafts.sort(order).map(finish);

  const counts = {
    commitments: items.filter((item) => item.kind === 'commitment').length,
    pixelBlocks: items.filter((item) => item.kind === 'pixel_block').length,
    pending: pendingItems.length,
    deadlines: items.filter((item) => item.kind === 'deadline').length,
  };
  const groups = query.view === 'upcoming' ? orderedGroups([...items, ...pendingItems]) : [];

  return {
    timezone,
    view: query.view,
    anchor: anchor.toISODate()!,
    today,
    range: rangeIso,
    title: window.title,
    navigation: { previous: window.previous, next: window.next, today },
    summary: summaryOf(query.view, counts, items, pendingItems, window, horizon, timezone),
    counts,
    days: window.days,
    items,
    pendingItems,
    groups,
    connection: {
      status,
      message: status === 'connected' ? null : (CONNECTION_COPY[status] ?? null),
    },
    horizonDays: query.view === 'upcoming' ? horizon : null,
    canExtend: query.view === 'upcoming' && horizon < AGENDA_UPCOMING_MAX_DAYS,
    generatedAt: now.toISOString(),
  };
}

const GROUP_ORDER_FIXED = ['Vencidas', 'Esta semana', 'Este mes'];

/** Próximos: «Vencidas», «Esta semana», «Este mes», los 2 meses siguientes y «Más adelante». */
function groupFor(view: AgendaView['view'], today: string, timezone: string) {
  if (view !== 'upcoming') return () => null;
  const now = DateTime.fromISO(today, { zone: timezone });
  const weekEnd = weekRange(now).endDate;
  return (item: Pick<Draft, 'status' | 'date'>): string => {
    if (item.status === 'overdue') return 'Vencidas';
    if (item.date <= weekEnd) return 'Esta semana';
    const day = DateTime.fromISO(item.date, { zone: timezone });
    if (day.hasSame(now, 'month')) return 'Este mes';
    const months = (day.year - now.year) * 12 + day.month - now.month;
    if (months <= 2) {
      const name = capitalize(es(day).toFormat('LLLL'));
      return day.year === now.year ? name : `${name} ${day.year}`;
    }
    return 'Más adelante';
  };
}

function orderedGroups(items: AgendaItem[]): string[] {
  const seen: string[] = [];
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  for (const item of sorted) if (item.group && !seen.includes(item.group)) seen.push(item.group);
  return [
    ...GROUP_ORDER_FIXED.filter((group) => seen.includes(group)),
    ...seen.filter((group) => !GROUP_ORDER_FIXED.includes(group) && group !== 'Más adelante'),
    ...(seen.includes('Más adelante') ? ['Más adelante'] : []),
  ];
}

/** Resumen determinista (sin IA): cantidades, el día más cargado y el próximo plazo. */
function summaryOf(
  view: AgendaView['view'],
  counts: AgendaView['counts'],
  items: AgendaItem[],
  pending: AgendaItem[],
  window: Window,
  horizon: number,
  timezone: string,
): string {
  const total = counts.commitments + counts.pixelBlocks + counts.pending + counts.deadlines;
  if (!total) return 'Todavía no hay mucho por mostrar.';
  const parts = [
    counts.commitments ? plural(counts.commitments, 'compromiso', 'compromisos') : null,
    counts.pixelBlocks
      ? plural(counts.pixelBlocks, 'bloque organizado por Pixel', 'bloques organizados por Pixel')
      : null,
    counts.pending
      ? plural(counts.pending, 'pendiente por organizar', 'pendientes por organizar')
      : null,
    counts.deadlines ? plural(counts.deadlines, 'fecha límite', 'fechas límite') : null,
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0]!;
  const lead =
    view === 'today'
      ? `Hoy tienes ${list}.`
      : view === 'week'
        ? `Esta semana tienes ${list}.`
        : view === 'month'
          ? `En ${window.title.split(' ')[0]!.toLocaleLowerCase('es')} tienes ${list}.`
          : `En los próximos ${horizon} días tienes ${list}.`;
  const extra: string[] = [];
  if (view === 'today') {
    const next = items.find(
      (item) => !item.allDay && (item.status === 'upcoming' || item.status === 'now'),
    );
    if (next) extra.push(`Lo próximo: «${next.title}» a las ${next.timeLabel?.slice(0, 5)}.`);
  }
  if (view === 'week' || view === 'month') {
    const load = new Map<string, number>();
    for (const item of [...items, ...pending])
      for (const date of item.dates) load.set(date, (load.get(date) ?? 0) + 1);
    const busiest = [...load.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (busiest && busiest[1] > 1) {
      const day = DateTime.fromISO(busiest[0], { zone: timezone });
      extra.push(
        `El día más cargado es el ${es(day).toFormat(view === 'week' ? 'cccc' : 'cccc d')}.`,
      );
    }
  }
  if (view === 'upcoming' || view === 'month') {
    const deadline = [...items, ...pending].find(
      (item) => item.deadline && item.status !== 'overdue',
    );
    if (deadline)
      extra.push(
        `El próximo plazo es «${deadline.title}» (${deadline.dayLabel.toLocaleLowerCase('es')}).`,
      );
  }
  return [lead, ...extra].join(' ');
}
