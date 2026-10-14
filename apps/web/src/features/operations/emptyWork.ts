import type { OperationsSummary } from '@pixel/contracts';

/**
 * Prompt 17: cuando no existe NINGÚN trabajo, el Inicio dice que el Pixel está listo (no una fila
 * de ceros). Cuenta lo que existe, no solo lo activo: una campaña en borrador, un proyecto
 * planificado, una tarea pendiente o una pieza sin publicar ya son trabajo.
 */
export interface EmptyWork {
  title: string;
  text: string;
}

export function isEmptyWork(summary: OperationsSummary, showCampaigns: boolean): boolean {
  const c = summary.counts;
  return (
    c.activeProjects === 0 &&
    c.openTasks === 0 &&
    c.contentInProduction === 0 &&
    c.activeContentItems === 0 &&
    (!showCampaigns || c.currentCampaigns === 0) &&
    summary.upcomingTasks.length === 0 &&
    summary.recentProjects.length === 0 &&
    summary.upcomingContent.length === 0
  );
}
