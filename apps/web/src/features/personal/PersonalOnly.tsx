import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { workspaceBasePath } from '../../app/navigation';
import { useWorkspace } from '../workspaces/workspaceContext';

/** Rutas solo de Pixel Personal: en otro tipo de workspace vuelve a su inicio. */
export function PersonalOnly({ children }: { children: ReactNode }) {
  const { overview } = useWorkspace();
  if (overview.workspace.type !== 'personal') {
    return <Navigate to={workspaceBasePath(overview.workspace.id)} replace />;
  }
  return children;
}
