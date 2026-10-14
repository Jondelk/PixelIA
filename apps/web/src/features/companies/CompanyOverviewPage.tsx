import { companyBasePath } from '../../app/navigation';
import { usePixelPresence } from '../presence/presenceContext';
import { PixelHomeHero } from '../presence/PixelHomeHero';
import { ENTERPRISE_SUGGESTIONS } from '../presence/suggestions';
import { BrandPixelCard } from './BrandPixelCard';
import { BrandWorkSection } from './BrandWorkSection';
import { CompanyAvatar } from './CompanyAvatar';
import { useCompany } from './companyContext';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

export function CompanyOverviewPage() {
  const { company } = useCompany();
  const base = companyBasePath(company.id);
  // El nombre del personaje llega con la vista previa del workspace (la misma de Tus Pixels).
  const { scope } = usePixelPresence();
  const characterName =
    scope?.workspaceId === company.workspaceId ? (scope.avatar?.name ?? null) : null;

  const header = (
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
  );

  const brandCards = (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <BrandPixelCard company={company} base={base} characterName={characterName} />

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
  );

  // Zero-entry-first + presencia (Prompt 17): con el ADN, lo dominante es el Pixel de la marca y
  // pedirle algo; debajo, lo que está en marcha (o, si no hay nada, que la marca está lista), y al
  // final la marca (personaje y datos). Sin ADN, primero el onboarding (sin personaje inventado).
  if (company.brandDnaVersion) {
    return (
      <>
        <PixelHomeHero
          workspaceId={company.workspaceId}
          eyebrow={company.industry}
          name={company.name}
          suggestions={ENTERPRISE_SUGGESTIONS}
        />
        <BrandWorkSection company={company} />
        <section className="mt-12" aria-label="Tu marca">
          <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            Tu marca
          </h2>
          {brandCards}
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      {brandCards}
      <BrandWorkSection company={company} />
    </>
  );
}
