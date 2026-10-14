import type { ProjectStatus } from '@pixel/contracts';

export type ProjectFilter = 'all' | 'active' | 'planned' | 'completed' | 'archived';

export const PROJECT_FILTERS: readonly { id: ProjectFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'planned', label: 'Planificados' },
  { id: 'completed', label: 'Completados' },
  { id: 'archived', label: 'Archivados' },
];

/** "Todos" = todo menos lo archivado (lo decide la API cuando no se envía estado). */
export function projectFilterStatuses(filter: ProjectFilter): ProjectStatus[] | undefined {
  return filter === 'all' ? undefined : [filter];
}

export function isProjectFilter(value: string | null): value is ProjectFilter {
  return PROJECT_FILTERS.some((filter) => filter.id === value);
}
