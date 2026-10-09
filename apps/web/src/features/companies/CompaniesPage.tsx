import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { companyBasePath } from '../../app/navigation';
import { useResource } from '../../lib/useResource';
import { listCompanies } from './companiesApi';
import { CompanyAvatar } from './CompanyAvatar';
import { PixelStatusBadge } from './PixelStatusBadge';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

export function CompaniesPage() {
  const { state, reload } = useResource('companies', listCompanies);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Empresas"
          title="Empresas"
          description="Cada empresa tiene su ADN y un personaje propio, construido a partir de él."
        />
        <NewCompanyLink className="mb-8 sm:mb-10" />
      </div>

      {state.status === 'loading' && (
        <div
          className="divide-y divide-line rounded-2xl border border-line bg-surface"
          aria-busy="true"
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4" aria-hidden="true">
              <div className="size-12 animate-pulse rounded-lg bg-elevated" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-elevated" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && <ErrorState error={state.error} onRetry={reload} />}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          title="Todavía no tienes empresas"
          description="Crea tu primera empresa. Pixel estudiará su marca y le dará un personaje propio."
          action={<NewCompanyLink />}
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {state.data.map((company) => (
            <li key={company.id}>
              <Link
                to={companyBasePath(company.id)}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-elevated"
              >
                <CompanyAvatar name={company.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{company.name}</p>
                  <p className="truncate text-sm text-subtle">{company.industry}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <PixelStatusBadge company={company} />
                  <p className="mt-1 text-xs text-subtle">
                    Creada el {dateFormat.format(new Date(company.createdAt))}
                  </p>
                </div>
                <Icon
                  name="arrowRight"
                  className="size-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NewCompanyLink({ className = '' }: { className?: string }) {
  return (
    <Link to="/companies/new" className={buttonClasses('primary', className)}>
      <Icon name="plus" className="size-4" /> Nueva empresa
    </Link>
  );
}
