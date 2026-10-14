import { workspaceSupportsFeature, type WorkspaceFeature } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { workspaceBasePath } from '../../app/navigation';
import { useWorkspace } from './workspaceContext';

/**
 * Rutas de una funcionalidad que depende del tipo de workspace (capacidades de contracts): si el
 * workspace activo no la admite, vuelve a su inicio. Mismo criterio que la API y la navegación.
 */
export function FeatureOnly({
  feature,
  children,
}: {
  feature: WorkspaceFeature;
  children: ReactNode;
}) {
  const { overview } = useWorkspace();
  if (!workspaceSupportsFeature(overview.workspace.type, feature)) {
    return <Navigate to={workspaceBasePath(overview.workspace.id)} replace />;
  }
  return children;
}
