import { DateTime } from 'luxon';
import type { TimeInterval } from './calendar.types.js';

/*
 * Motor de disponibilidad (Prompt 19, docs/PERSONAL-WEEK-PLANNER.md §Disponibilidad). Puro y
 * determinista: sin Google, sin Mongo, sin IA. Trabaja en instantes absolutos (ms) y solo pasa a
 * hora local (luxon, con la zona IANA del usuario) para construir ventanas de días, así respeta los
 * cambios de horario y los días que cruzan la medianoche. Nunca usa la zona del servidor.
 */

/** Intervalo [start, end) en milisegundos desde epoch. */
export interface Span {
  start: number;
  end: number;
}

export const toSpan = (interval: TimeInterval): Span => ({
  start: Date.parse(interval.start),
  end: Date.parse(interval.end),
});

export const toInterval = (span: Span): TimeInterval => ({
  start: new Date(span.start).toISOString(),
  end: new Date(span.end).toISOString(),
});

export const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

export const minutesOf = (span: Span): number => (span.end - span.start) / 60_000;

/** Ordena y une intervalos que se solapan o se tocan (anidados incluidos). Ignora los vacíos. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** Lo que queda libre de `window` al quitarle lo ocupado. */
export function subtractBusy(window: Span, busy: Span[]): Span[] {
  const free: Span[] = [];
  let cursor = window.start;
  for (const span of mergeSpans(busy)) {
    if (span.end <= cursor) continue;
    if (span.start >= window.end) break;
    if (span.start > cursor) free.push({ start: cursor, end: Math.min(span.start, window.end) });
    cursor = Math.max(cursor, span.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/** ¿El intervalo está libre del todo? (Revalidación antes de escribir.) */
export const isFree = (span: Span, busy: Span[]): boolean => !busy.some((b) => overlaps(span, b));

export interface DayWindow {
  /** Fecha local `yyyy-MM-dd` del día en que EMPIEZA la ventana. */
  date: string;
  /** 1 = lunes … 7 = domingo (ISO). */
  weekday: number;
  span: Span;
}

/**
 * Ventanas horarias permitidas de cada día local del rango. `endHour <= startHour` = la ventana
 * cruza la medianoche (p. ej. 22–2). Las horas son locales: un día de cambio de horario tiene la
 * ventana correcta aunque dure 23 o 25 horas.
 */
export function dailyWindows(
  range: Span,
  timezone: string,
  startHour: number,
  endHour: number,
): DayWindow[] {
  const windows: DayWindow[] = [];
  let day = DateTime.fromMillis(range.start, { zone: timezone }).startOf('day').minus({ days: 1 });
  const last = DateTime.fromMillis(range.end, { zone: timezone }).endOf('day');
  for (; day <= last; day = day.plus({ days: 1 })) {
    const start = day.set({ hour: startHour });
    const end =
      endHour > startHour
        ? endHour === 24
          ? day.plus({ days: 1 }).startOf('day')
          : day.set({ hour: endHour })
        : day.plus({ days: 1 }).set({ hour: endHour });
    const span = {
      start: Math.max(start.toMillis(), range.start),
      end: Math.min(end.toMillis(), range.end),
    };
    if (span.end > span.start) {
      windows.push({ date: day.toISODate()!, weekday: day.weekday, span });
    }
  }
  return windows;
}

/** Huecos libres de al menos `minMinutes` dentro de las ventanas. */
export function freeSlots(windows: DayWindow[], busy: Span[], minMinutes: number): DayWindow[] {
  return windows.flatMap((window) =>
    subtractBusy(window.span, busy)
      .filter((span) => minutesOf(span) >= minMinutes)
      .map((span) => ({ ...window, span })),
  );
}

/** Redondea hacia arriba al siguiente múltiplo de `step` minutos (los bloques empiezan «en punto»). */
export function ceilToStep(ms: number, stepMinutes = 30): number {
  const step = stepMinutes * 60_000;
  return Math.ceil(ms / step) * step;
}

export type PlanningHorizon = 'this_week' | 'next_week' | 'next_7_days';

/**
 * Rango del horizonte en la zona del usuario (semana de lunes a domingo). Nunca empieza en el
 * pasado: «esta semana» va desde ahora hasta el domingo a medianoche.
 */
export function horizonRange(horizon: PlanningHorizon, now: Date, timezone: string): Span {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  if (horizon === 'next_7_days') {
    return { start: now.getTime(), end: local.plus({ days: 7 }).endOf('day').toMillis() + 1 };
  }
  const monday = local.startOf('week');
  if (horizon === 'this_week') {
    return { start: now.getTime(), end: monday.plus({ weeks: 1 }).toMillis() };
  }
  return {
    start: monday.plus({ weeks: 1 }).toMillis(),
    end: monday.plus({ weeks: 2 }).toMillis(),
  };
}

/** ¿Existe esta zona IANA? (luxon la valida contra Intl.) */
export const isValidTimezone = (timezone: string | null | undefined): timezone is string =>
  Boolean(timezone && DateTime.now().setZone(timezone).isValid);
