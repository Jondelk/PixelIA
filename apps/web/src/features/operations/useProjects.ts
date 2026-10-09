import { PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from '@pixel/contracts';
import { useResource } from '../../lib/useResource';
import { listProjects } from './projectsApi';

const ALL_PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];

/**
 * Proyectos del workspace para nombrar y asignar (selectores de Tareas y Contenido). Incluye los
 * archivados para poder mostrar su nombre; `assignable` los excluye.
 */
export function useWorkspaceProjects(workspaceId: string) {
  const { state, reload } = useResource(`project-options:${workspaceId}`, (signal) =>
    listProjects(workspaceId, { status: ALL_PROJECT_STATUSES, limit: 100 }, signal),
  );
  const all: Project[] = state.status === 'success' ? state.data.projects : [];
  return {
    all,
    assignable: all.filter((project) => project.status !== 'archived'),
    reload,
  };
}
