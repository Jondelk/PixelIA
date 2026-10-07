import type { WorkspaceOverview } from '@pixel/contracts';
import { useOutletContext } from 'react-router';

export interface WorkspaceOutletContext {
  overview: WorkspaceOverview;
  reload: () => void;
}

/** Workspace activo, cargado y autorizado por <WorkspaceLayout>. */
export function useWorkspace(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}
