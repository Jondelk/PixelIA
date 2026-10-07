import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { companyBasePath, companyNav } from '../../app/navigation';
import { CompanyAvatar } from './CompanyAvatar';
import { useCompany } from './companyContext';
import { PixelStatusBadge } from './PixelStatusBadge';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

export function CompanyOverviewPage() {
  const { company } = useCompany();
  const sections = companyNav(company.id).slice(1);
  const base = companyBasePath(company.id);
  const cta = company.avatarVersion
    ? {
        to: `${base}/pixel`,
        label: 'Ver el personaje de tu marca',
        text: 'La marca ya tiene ADN y un personaje derivado de él. Ábrelo para verlo en 3D.',
      }
    : company.brandDnaVersion
      ? {
          to: `${base}/pixel`,
          label: 'Crear el personaje de tu marca',
          text: 'Pixel ya conoce el ADN de esta marca. Ahora puede convertirlo en su personaje.',
        }
      : company.status === 'onboarding'
        ? {
            to: `${base}/onboarding`,
            label: 'Continuar onboarding',
            text: 'Pixel está aprendiendo esta marca. Completa los 8 pasos del onboarding para que genere su ADN.',
          }
        : {
            to: `${base}/onboarding`,
            label: 'Enseñarle tu marca a Pixel',
            text: 'Para que Pixel tome forma, primero estudiará el ADN de la marca en el onboarding. De ahí saldrán su voz, su criterio y el personaje de tu marca.',
          };

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={`Logo de ${company.name}`}
            className="size-16 rounded-xl border border-line-strong bg-elevated object-contain p-2"
          />
        ) : (
          <CompanyAvatar name={company.name} size="lg" />
        )}
        <div className="min-w-0">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            {company.industry}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
            {company.name}
          </h1>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="font-display text-base font-bold">Su personaje</h2>
          <div className="mt-3">
            <PixelStatusBadge company={company} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">{cta.text}</p>
          <Link to={cta.to} className={`${buttonClasses('primary')} mt-5`}>
            {cta.label} <Icon name="arrowRight" className="size-4" />
          </Link>
          <ul className="mt-6 grid gap-2 sm:grid-cols-3">
            {sections.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <Icon name={item.icon} className="size-4" /> {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="font-display text-base font-bold">Datos de la empresa</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-subtle">Descripción</dt>
              <dd className="mt-1 whitespace-pre-line text-fg">
                {company.description || <span className="text-subtle">Sin descripción</span>}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Identificador</dt>
              <dd className="mt-1 text-xs text-muted">{company.slug}</dd>
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
