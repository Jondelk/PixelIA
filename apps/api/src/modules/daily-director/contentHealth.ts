import type { ContentItem, ContentPlanItem, PersonalDnaContent } from '@pixel/contracts';
import { daysUntil, type DayContext } from './dailyTime.js';

/*
 * ContentHealth: estado del contenido del workspace para hoy.
 * - overdue: tenía fecha prevista pasada y no está publicado.
 * - readyUnpublished: listo para publicar.
 * - dueSoon: previsto para los próximos 3 días.
 * - noPlannedContent: nada previsto ni en marcha para los próximos 7 días. Solo se convierte en
 *   aviso si el contenido es relevante para la persona (contentRelevant).
 */

export const CONTENT_WINDOW_DAYS = 7;

export interface ContentHealth {
  overdue: ContentItem[];
  readyUnpublished: ContentItem[];
  dueSoon: ContentItem[];
  noPlannedContent: boolean;
}

const UNPUBLISHED = new Set<ContentItem['status']>([
  'idea',
  'planned',
  'production',
  'review',
  'ready',
]);
const IN_PROGRESS = new Set<ContentItem['status']>(['production', 'review', 'ready']);

export function contentHealth(
  items: readonly ContentItem[],
  planItems: readonly ContentPlanItem[],
  day: DayContext,
): ContentHealth {
  const pending = items.filter((item) => UNPUBLISHED.has(item.status));
  const days = (item: { scheduledFor: string | null }) => daysUntil(item.scheduledFor, day);
  const inWindow = (value: number | null) =>
    value !== null && value >= 0 && value <= CONTENT_WINDOW_DAYS;
  const planned =
    pending.some((item) => inWindow(days(item)) || IN_PROGRESS.has(item.status)) ||
    planItems.some((item) => item.status === 'proposed' && inWindow(days(item)));
  return {
    overdue: pending.filter((item) => (days(item) ?? 0) < 0),
    readyUnpublished: pending.filter((item) => item.status === 'ready'),
    dueSoon: pending.filter((item) => {
      const value = days(item);
      return value !== null && value >= 0 && value <= 3;
    }),
    noPlannedContent: !planned,
  };
}

const CONTENT_HELP = /contenid|redes|marca personal|publica|ideas creativas|comunidad|audiencia/;

/** El contenido es relevante si la persona pidió ayuda con él o tiene objetivos de contenido. */
export function contentRelevant(dna: PersonalDnaContent): boolean {
  const help = dna.supportNeeds.wantsHelpWith
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return CONTENT_HELP.test(help) || dna.goals.content.length > 0;
}
