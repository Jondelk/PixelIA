import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { companyNav } from '../../app/navigation';
import { CompanyAvatar } from './CompanyAvatar';
import { useCompany } from './companyContext';
import { PixelStatusBadge } from './PixelStatusBadge';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

export function CompanyOverviewPage() {
  const { company } = useCompany();
  const sections = companyNav(company.id).slice(1);

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={`Logo de ${company.name}`}
            className="size-16 rounded-2xl border border-line-strong bg-elevated object-contain p-2"
          />
        ) : (
          <CompanyAvatar name={company.name} size="lg" />
        )}
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent/80">
            {company.industry}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-tight">
            {company.name}
          </h1>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface/80 p-6">
          <h2 className="font-display text-base font-semibold">Su Pixel</h2>
          <div className="mt-3">
            <PixelStatusBadge status={company.status} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Para que Pixel tome forma, primero estudiará el ADN de la marca en el onboarding. De ahí
            saldrán su personalidad, su voz y su avatar 3D.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-3">
            {sections.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
                >
                  <Icon name={item.icon} className="size-4 text-accent" /> {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface/80 p-6">
          <h2 className="font-display text-base font-semibold">Datos de la empresa</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-subtle">Descripción</dt>
              <dd className="mt-1 whitespace-pre-line text-fg/90">
                {company.description || <span className="text-subtle">Sin descripción</span>}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Identificador</dt>
              <dd className="mt-1 font-mono text-xs text-muted">{company.slug}</dd>
            </div>
            <div>
              <dt className="text-subtle">Creada</dt>
              <dd className="mt-1 text-muted">{dateFormat.format(new Date(company.createdAt))}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
