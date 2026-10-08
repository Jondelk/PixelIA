import { CONTENT_PIPELINE, type ContentItem, type ContentStatus } from '@pixel/contracts';
import { PIPELINE_TAB_LABELS } from './labels';

/*
 * Vista pipeline de /workspace/:workspaceId/content: pestañas por etapa con su conteo. Se carga
 * una sola lista (sin archivados) y se agrupa en el cliente; lo archivado se pide aparte.
 */

export type ContentTab = ContentStatus;

export const CONTENT_TABS: readonly ContentTab[] = [...CONTENT_PIPELINE, 'archived'];

export const DEFAULT_CONTENT_TAB: ContentTab = 'idea';

export function isContentTab(value: string | null): value is ContentTab {
  return (CONTENT_TABS as readonly string[]).includes(value ?? '');
}

/** Conteo por etapa del pipeline (archivado no se cuenta: se carga aparte). */
export function countByStatus(items: readonly ContentItem[]): Record<ContentStatus, number> {
  const counts = Object.fromEntries(CONTENT_TABS.map((tab) => [tab, 0])) as Record<
    ContentStatus,
    number
  >;
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export function contentTabOptions(counts: Record<ContentStatus, number> | null) {
  return CONTENT_TABS.map((tab) => ({
    id: tab,
    label: PIPELINE_TAB_LABELS[tab],
    count: counts && tab !== 'archived' ? counts[tab] : undefined,
  }));
}

/** Piezas de una etapa: con fecha prevista primero (la más cercana), luego las más recientes. */
export function itemsInStage(items: readonly ContentItem[], stage: ContentStatus): ContentItem[] {
  return items
    .filter((item) => item.status === stage)
    .sort((a, b) => {
      if (a.scheduledFor && b.scheduledFor) return a.scheduledFor.localeCompare(b.scheduledFor);
      if (a.scheduledFor) return -1;
      if (b.scheduledFor) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
