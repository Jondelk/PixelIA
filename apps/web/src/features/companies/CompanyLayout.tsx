import { Link, Outlet, useParams } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { ApiRequestError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { getCompany } from './companiesApi';
import type { CompanyOutletContext } from './companyContext';

/**
 * Carga una vez la empresa de /company/:companyId para todas sus pantallas.
 * La API devuelve 404 tanto si no existe como si pertenece a otro usuario.
 */
export function CompanyLayout() {
  const { companyId = '' } = useParams();
  const { state, reload } = useResource(`company:${companyId}`, (signal) =>
    getCompany(companyId, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Cargando empresa…
      </div>
    );
  }

  if (state.status === 'error') {
    if (state.error instanceof ApiRequestError && state.error.status === 404) {
      return (
        <>
          <PageHeader
            eyebrow="404"
            title="Empresa no encontrada"
            description="No existe o no tienes acceso a ella."
          />
          <Link to="/companies" className={buttonClasses('secondary')}>
            Ver mis empresas
          </Link>
        </>
      );
    }
    return <ErrorState error={state.error} onRetry={reload} />;
  }

  const context: CompanyOutletContext = { company: state.data, reload };
  return <Outlet context={context} />;
}
