import { z } from 'zod';

/*
 * Zona horaria IANA ("America/Bogota"). Define qué es "hoy" para un workspace (Daily Director).
 * Siempre explícita: nunca se infiere de un texto libre como PersonalProfile.location.
 */

/** Zona horaria por defecto si el workspace no tiene una (configurable con DEFAULT_TIMEZONE). */
export const DEFAULT_TIMEZONE = 'America/Bogota';

export function isValidTimezone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const TimezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimezone, 'Usa una zona horaria IANA, p. ej. America/Bogota');

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Día local "YYYY-MM-DD" de un instante en una zona horaria. */
export function localDateIn(instant: Date, timezone: string): string {
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormatters.set(timezone, formatter);
  }
  return formatter.format(instant);
}

/** Días de calendario entre dos días "YYYY-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
