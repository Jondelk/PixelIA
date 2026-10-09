import { daysBetween, localDateIn } from '@pixel/contracts';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';

/*
 * "Hoy" del Daily Director: siempre el día local de la zona horaria del WORKSPACE (IANA). Si el
 * workspace no tiene una, se usa DEFAULT_TIMEZONE del servidor (documentado). Nunca UTC como día
 * del usuario y nunca inferida de un texto libre (PersonalProfile.location).
 */

export function workspaceTimezone(workspace: WorkspaceDocument, fallback: string): string {
  return workspace.timezone || fallback;
}

/** Contexto temporal de un cálculo: día local de hoy y su zona horaria. */
export interface DayContext {
  today: string;
  timezone: string;
}

export function dayContext(now: Date, timezone: string): DayContext {
  return { today: localDateIn(now, timezone), timezone };
}

/** Días locales entre hoy y una fecha ISO (0 = hoy, 1 = mañana, −1 = ayer). null si no hay fecha. */
export function daysUntil(iso: string | null, day: DayContext): number | null {
  if (!iso) return null;
  return daysBetween(day.today, localDateIn(new Date(iso), day.timezone));
}

/** "hoy", "mañana", "ayer", "en 3 días", "hace 2 días". */
export function relativeDay(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}
