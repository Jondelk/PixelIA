/*
 * Fechas de Operations. La API guarda y devuelve UTC (ISO 8601); la interfaz trabaja con días
 * locales. Un día elegido en un <input type="date"> se guarda como el MEDIODÍA local de ese día:
 * así sigue siendo el mismo día aunque el navegador cambie unas horas de zona horaria.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-10-15" (día local) → ISO UTC del mediodía local de ese día. Vacío → null. */
export function dateInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO UTC → "YYYY-MM-DD" del día local (para un <input type="date">). */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hoy en formato de <input type="date">. */
export function todayInput(now = new Date()): string {
  return isoToDateInput(now.toISOString());
}

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Días de calendario local entre hoy y la fecha (0 = hoy, 1 = mañana, -1 = ayer). */
export function dayDiff(iso: string, now = new Date()): number {
  return Math.round((startOfLocalDay(new Date(iso)) - startOfLocalDay(now)) / 86_400_000);
}

const sameYear = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const otherYear = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const longFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

/** "Hoy", "Mañana", "Ayer" o "15 oct" (con año si no es el actual). */
export function formatDay(iso: string, now = new Date()): string {
  const diff = dayDiff(iso, now);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const date = new Date(iso);
  return (date.getFullYear() === now.getFullYear() ? sameYear : otherYear)
    .format(date)
    .replace('.', '');
}

export function formatLongDate(iso: string): string {
  return longFormat.format(new Date(iso));
}

/** La fecha ya pasó (antes de hoy, en días locales). */
export function isPastDay(iso: string, now = new Date()): boolean {
  return dayDiff(iso, now) < 0;
}
