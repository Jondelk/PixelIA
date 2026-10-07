import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { enterpriseRedirectPath } from '../../app/navigation';
import { ApiRequestError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import type { WorkspaceOutletContext } from './workspaceContext';
import { getWorkspace } from './workspacesApi';

/**
 * Entrada única de un Pixel: /workspace/:workspaceId[/chat|/pixel].
 *
 * Estrategia de convergencia (docs/WORKSPACES.md): por ahora las pantallas Enterprise siguen
 * viviendo en /company/:companyId, así que un workspace enterprise con empresa redirige allí
 * conservando la subruta. Personal (y enterprise aún sin empresa) se muestran aquí. Cuando las
 * pantallas de empresa se muden a /workspace/:workspaceId, se invierte la redirección.
 * La API devuelve 404 tanto si el workspace no existe como si es de otro usuario.
 */
export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const { pathname } = useLocation();
  const { state, reload } = useResource(`workspace:${workspaceId}`, (signal) =>
    getWorkspace(workspaceId, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Cargando tu Pixel…
      </div>
    );
  }

  if (state.status === 'error') {
    if (state.error instanceof ApiRequestError && state.error.status === 404) {
      return (
        <>
          <PageHeader
            eyebrow="404"
            title="Pixel no encontrado"
            description="No existe o no tienes acceso a él."
          />
          <Link to="/dashboard" className={buttonClasses('secondary')}>
            Ver tus Pixels
          </Link>
        </>
      );
    }
    return <ErrorState error={state.error} onRetry={reload} />;
  }

  const { workspace, company } = state.data;
  if (workspace.type === 'enterprise' && company) {
    return <Navigate to={enterpriseRedirectPath(pathname, company.id)} replace />;
  }

  const context: WorkspaceOutletContext = { overview: state.data, reload };
  return <Outlet context={context} />;
}
