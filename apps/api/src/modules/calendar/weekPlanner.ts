import type { GeneratedWeekPlanning, PlanningWeekday } from '@pixel/contracts';
import { PLANNING_WEEKDAYS } from '@pixel/contracts';
import { DateTime } from 'luxon';
import {
  ceilToStep,
  dailyWindows,
  freeSlots,
  horizonRange,
  isFree,
  minutesOf,
  toInterval,
  type DayWindow,
  type Span,
} from './availability.js';
import type { TimeInterval } from './calendar.types.js';

/*
 * PersonalWeekPlanner (Prompt 19, docs/PERSONAL-WEEK-PLANNER.md). Determinista: recibe lo que la IA
 * (o las reglas) entendieron, la hora actual, la zona del usuario y lo OCUPADO real de su
 * calendario, y propone bloques. No escribe nada: el plan es una propuesta.
 *
 * - Restricciones duras: lo ocupado en Google, el pasado, la fecha límite (las sesiones terminan
 *   ANTES del día del parcial) y los bloques del propio plan (nunca se solapan).
 * - Blandas: la ventana horaria (provisional si no la dijo), los días que pidió evitar, el reparto
 *   en días distintos y la hora preferida.
 * - Lo que no cabe se informa (`unscheduledItems`); nunca se crea un conflicto.
 */

export const DEFAULT_WINDOW = { startHour: 8, endHour: 21 } as const;
export const DEFAULT_SESSION_MINUTES = 90;
/** Duración que se reserva para un compromiso mencionado con hora pero sin duración. */
const COMMITMENT_MINUTES = 60;

export interface PlannedBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  dayLabel: string;
  timeLabel: string;
  estimated: boolean;
  reason: string | null;
}

export interface WeekPlan {
  timezone: string;
  range: TimeInterval;
  assumptions: string[];
  /** Cuántos compromisos reales del calendario se respetaron. */
  fixedCommitments: number;
  proposedBlocks: PlannedBlock[];
  unscheduledItems: { title: string; reason: string }[];
  conflicts: { title: string; reason: string }[];
  rationale: string;
}

export interface WeekPlannerInput {
  now: Date;
  timezone: string;
  request: GeneratedWeekPlanning;
  /** Ocupado real (free/busy de Google) dentro del rango. Restricción dura. */
  busy: Span[];
  fixedCommitments: number;
}

const WEEKDAY_NUMBER: Record<PlanningWeekday, number> = Object.fromEntries(
  PLANNING_WEEKDAYS.map((day, index) => [day, index + 1]),
) as Record<PlanningWeekday, number>;

const WEEKDAY_ES: Record<PlanningWeekday, string> = {
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miércoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sábado',
  sunday: 'domingo',
};

export const weekdayName = (day: PlanningWeekday) => WEEKDAY_ES[day];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function blockLabels(span: Span, timezone: string) {
  const start = DateTime.fromMillis(span.start, { zone: timezone }).setLocale('es');
  const end = DateTime.fromMillis(span.end, { zone: timezone });
  return {
    dayLabel: capitalize(start.toFormat("cccc d 'de' LLLL")),
    timeLabel: `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`,
  };
}

const parseTime = (time: string | null) => {
  if (!time) return null;
  const [hour, minute] = time.split(':').map(Number);
  return { hour: hour!, minute: minute! };
};

/** Primer día local del rango con ese día de la semana (o null si el rango no lo incluye). */
function dayInRange(range: Span, timezone: string, weekday: PlanningWeekday): DateTime | null {
  let day = DateTime.fromMillis(range.start, { zone: timezone }).startOf('day');
  const end = DateTime.fromMillis(range.end, { zone: timezone });
  for (; day < end; day = day.plus({ days: 1 })) {
    if (day.weekday === WEEKDAY_NUMBER[weekday]) return day;
  }
  return null;
}

/** Primer inicio libre dentro del hueco para `minutes` (en punto o y media; nunca en el pasado). */
function fitIn(slot: Span, minutes: number, now: number, preferred: number | null): Span | null {
  const length = minutes * 60_000;
  if (preferred !== null && preferred >= slot.start && preferred + length <= slot.end) {
    if (preferred >= now) return { start: preferred, end: preferred + length };
  }
  const start = ceilToStep(Math.max(slot.start, now));
  return start + length <= slot.end ? { start, end: start + length } : null;
}

/** Hora preferida en el día local de un hueco. */
const preferredOn = (
  slot: DayWindow,
  timezone: string,
  time: { hour: number; minute: number } | null,
) =>
  time
    ? DateTime.fromISO(slot.date, { zone: timezone })
        .set({ hour: time.hour, minute: time.minute })
        .toMillis()
    : null;

/** Reparte N elementos lo más separados posible entre E opciones ordenadas. */
function spread<T>(options: T[], count: number): T[] {
  if (count >= options.length) return options;
  if (count === 1) return [options[0]!];
  const picked = new Set<number>();
  for (let i = 0; i < count; i += 1)
    picked.add(Math.round((i * (options.length - 1)) / (count - 1)));
  return [...picked].sort((a, b) => a - b).map((index) => options[index]!);
}

export function planWeek(input: WeekPlannerInput): WeekPlan {
  const { request, timezone } = input;
  const now = input.now.getTime();
  const range = horizonRange(request.horizon, input.now, timezone);
  const assumptions: string[] = [];
  const unscheduled: { title: string; reason: string }[] = [];
  const conflicts: { title: string; reason: string }[] = [];

  const startHour = request.window.startHour ?? DEFAULT_WINDOW.startHour;
  const endHour =
    request.window.endHour ?? (startHour >= DEFAULT_WINDOW.endHour ? 24 : DEFAULT_WINDOW.endHour);
  if (request.window.startHour === null && request.window.endHour === null) {
    assumptions.push(
      `Usé un horario provisional de ${startHour}:00 a ${endHour}:00; dime si prefieres otro.`,
    );
  }

  // Compromisos que mencionó: con hora → ocupado; sin hora → ese día se deja libre.
  const busy = [...input.busy];
  const avoidDates = new Set<string>();
  for (const day of request.avoidDays) {
    const date = dayInRange(range, timezone, day);
    if (date) avoidDates.add(date.toISODate()!);
  }
  let deadline: { at: number; title: string; day: PlanningWeekday } | null = null;
  let deadlineMissing: string | null = null;
  for (const commitment of request.commitments) {
    if (!commitment.day) continue;
    const date = dayInRange(range, timezone, commitment.day);
    if (commitment.isDeadline) {
      if (!date) {
        deadlineMissing = `El ${weekdayName(commitment.day)} de «${commitment.title}» ya no está dentro de este horizonte.`;
        continue;
      }
      // El trabajo previo termina ANTES del día de la fecha límite (no la mañana del parcial).
      const at = date.startOf('day').toMillis();
      if (!deadline || at < deadline.at)
        deadline = { at, title: commitment.title, day: commitment.day };
      continue;
    }
    if (!date) continue;
    const time = parseTime(commitment.time);
    if (time) {
      const start = date.set({ hour: time.hour, minute: time.minute }).toMillis();
      busy.push({ start, end: start + COMMITMENT_MINUTES * 60_000 });
    } else {
      avoidDates.add(date.toISODate()!);
      assumptions.push(
        `Dejé libre el ${weekdayName(commitment.day)} por «${commitment.title}», porque no me dijiste la hora.`,
      );
    }
  }
  if (deadline) {
    assumptions.push(
      `Todas las sesiones terminan antes del ${weekdayName(deadline.day)} («${deadline.title}»).`,
    );
  }

  const planEnd = deadline ? Math.min(range.end, deadline.at) : range.end;
  const windows = dailyWindows(
    { start: Math.max(range.start, now), end: planEnd },
    timezone,
    startHour,
    endHour,
  ).filter((window) => !avoidDates.has(window.date));

  const blocks: PlannedBlock[] = [];
  const planned: Span[] = [];
  let estimatedMinutes: number | null = null;
  let counter = 0;

  for (const session of request.sessions) {
    const minutes = session.durationMinutes ?? DEFAULT_SESSION_MINUTES;
    const estimated = session.durationMinutes === null;
    if (estimated) estimatedMinutes = minutes;
    const time = parseTime(session.time);
    if (deadlineMissing) {
      for (let i = 0; i < session.count; i += 1) {
        unscheduled.push({ title: session.title, reason: deadlineMissing });
      }
      continue;
    }

    const usedDates = new Set<string>();
    const place = (allowed: DayWindow[]) => {
      // Un hueco por día (repartir); el primero que quepa, a la hora preferida si se puede.
      const byDay = new Map<string, Span>();
      for (const slot of freeSlots(allowed, [...busy, ...planned], minutes)) {
        if (byDay.has(slot.date) || usedDates.has(slot.date)) continue;
        const span = fitIn(slot.span, minutes, now, preferredOn(slot, timezone, time));
        if (span) byDay.set(slot.date, span);
      }
      return [...byDay.entries()];
    };

    const targetDate = session.day
      ? dayInRange({ start: Math.max(range.start, now), end: planEnd }, timezone, session.day)
      : null;
    if (session.day && !targetDate) {
      for (let i = 0; i < session.count; i += 1) {
        unscheduled.push({
          title: session.title,
          reason: `El ${weekdayName(session.day)} no está disponible dentro de este plan.`,
        });
      }
      continue;
    }
    const allowed = targetDate ? windows.filter((w) => w.date === targetDate.toISODate()) : windows;
    const options = place(allowed);
    const chosen = spread(options, session.count);
    for (const [date, span] of chosen) {
      counter += 1;
      usedDates.add(date);
      planned.push(span);
      blocks.push({
        id: `block_${counter}`,
        title: session.title,
        ...toInterval(span),
        ...blockLabels(span, timezone),
        estimated,
        reason: deadline ? `Antes de «${deadline.title}»` : null,
      });
    }
    const missing = session.count - chosen.length;
    for (let i = 0; i < missing; i += 1) {
      unscheduled.push({
        title: session.title,
        reason: deadline
          ? `No encontré otro hueco libre de ${minutes} minutos antes del ${weekdayName(deadline.day)}.`
          : `No encontré otro hueco libre de ${minutes} minutos en este horizonte.`,
      });
    }
  }

  if (estimatedMinutes !== null) {
    assumptions.unshift(
      `He reservado bloques de ${estimatedMinutes} minutos porque no indicaste la duración.`,
    );
  }
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  blocks.forEach((block, index) => (block.id = `block_${index + 1}`));

  const rationale = blocks.length
    ? `Propongo ${blocks.length} ${blocks.length === 1 ? 'bloque' : 'bloques'} en ${new Set(blocks.map((b) => b.dayLabel)).size === blocks.length ? 'días distintos' : 'tus huecos libres'}, sin tocar ${input.fixedCommitments === 1 ? 'tu compromiso' : `tus ${input.fixedCommitments} compromisos`} del calendario.`
    : 'No encontré huecos libres que cumplan lo que pediste.';

  return {
    timezone,
    range: toInterval(range),
    assumptions,
    fixedCommitments: input.fixedCommitments,
    proposedBlocks: blocks,
    unscheduledItems: unscheduled,
    conflicts,
    rationale,
  };
}

export interface MoveTarget {
  weekday: PlanningWeekday | null;
  time: string | null;
}

/**
 * Nuevo horario para un bloque que se mueve (replanificar o «Ajustar»). Mantiene la duración; con
 * día y hora exactos los exige libres (si no, no lo mueve: lo dice); sin hora, el primer hueco del
 * día; sin día, el primer hueco desde mañana. Nunca en el pasado.
 */
export function findMoveSlot(input: {
  block: Span;
  target: MoveTarget;
  now: Date;
  timezone: string;
  busy: Span[];
  window?: { startHour: number; endHour: number };
  /**
   * Dónde buscar. «Ajustar» un plan busca DENTRO del rango del plan («al jueves» = el jueves de esa
   * semana); replanificar, en los próximos días.
   */
  within?: Span;
}): { span: Span } | { reason: string } {
  const { timezone, target } = input;
  const now = input.now.getTime();
  const minutes = minutesOf(input.block);
  const window = input.window ?? DEFAULT_WINDOW;
  const local = DateTime.fromJSDate(input.now, { zone: timezone });
  const tomorrow = local.plus({ days: 1 }).startOf('day').toMillis();
  const range: Span = input.within
    ? { start: Math.max(input.within.start, now), end: input.within.end }
    : {
        start: target.weekday ? now : tomorrow,
        end: local.plus({ days: 8 }).endOf('day').toMillis(),
      };
  const date = target.weekday
    ? dayInRange(
        input.within ? range : { start: tomorrow, end: range.end },
        timezone,
        target.weekday,
      )
    : null;
  if (target.weekday && !date)
    return { reason: `No encontré el ${weekdayName(target.weekday)} en los próximos días.` };
  const time = parseTime(target.time);
  if (date && time) {
    const start = date.set({ hour: time.hour, minute: time.minute }).toMillis();
    const span = { start, end: start + minutes * 60_000 };
    if (start < now) return { reason: 'Ese horario ya pasó.' };
    if (!isFree(span, input.busy)) {
      return { reason: `El ${weekdayName(target.weekday!)} a las ${target.time} ya está ocupado.` };
    }
    return { span };
  }
  const windows = dailyWindows(range, timezone, window.startHour, window.endHour).filter(
    (w) => !date || w.date === date.toISODate(),
  );
  for (const slot of freeSlots(windows, input.busy, minutes)) {
    const span = fitIn(slot.span, minutes, now, null);
    if (span) return { span };
  }
  return {
    reason: target.weekday
      ? `No encontré un hueco libre de ${minutes} minutos el ${weekdayName(target.weekday)}.`
      : `No encontré un hueco libre de ${minutes} minutos en los próximos días.`,
  };
}
