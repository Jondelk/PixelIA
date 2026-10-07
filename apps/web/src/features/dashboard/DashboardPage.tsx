import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { useResource } from '../../lib/useResource';
import { NewCompanyLink } from '../companies/CompaniesPage';
import { listCompanies } from '../companies/companiesApi';
import { PixelCard, PixelCardSkeleton } from '../companies/PixelCard';
import { useCurrentUser } from '../auth/authContext';

export function DashboardPage() {
  const user = useCurrentUser();
  const { state, reload } = useResource('companies', listCompanies);
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow={`Hola, ${firstName}`}
          title="Tus marcas"
          description="Pixel es el director creativo de cada una: aprende su ADN y le da un personaje propio."
        />
        {state.status === 'success' && state.data.length > 0 && (
          <NewCompanyLink className="mb-8 sm:mb-10" />
        )}
      </div>

      {state.status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <PixelCardSkeleton />
          <PixelCardSkeleton />
          <PixelCardSkeleton />
        </div>
      )}

      {state.status === 'error' && <ErrorState error={state.error} onRetry={reload} />}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          title="Aún no tienes ninguna marca"
          description="Crea tu primera empresa. Pixel estudiará su marca y será su director creativo."
          action={<NewCompanyLink />}
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.data.map((company) => (
            <Reveal key={company.id}>
              <PixelCard company={company} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
