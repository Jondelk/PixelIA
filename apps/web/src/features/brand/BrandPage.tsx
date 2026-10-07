import { ONBOARDING_STEPS } from '@pixel/contracts';
import { Link, useSearchParams } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { useResource } from '../../lib/useResource';
import { useCompany } from '../companies/companyContext';
import { getBrandBrain } from './brandApi';
import { BrandDnaView } from './BrandDnaView';

export function BrandPage() {
  const { company } = useCompany();
  const [searchParams] = useSearchParams();
  const { state, reload } = useResource(`brand-brain:${company.id}`, (signal) =>
    getBrandBrain(company.id, signal),
  );
  const onboardingHref = `${companyBasePath(company.id)}/onboarding`;

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-accent" /> Cargando el ADN de marca…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  const { onboarding, brandDna } = state.data;
  if (brandDna) {
    return (
      <BrandDnaView
        dna={brandDna}
        editHref={onboardingHref}
        justLearned={searchParams.has('learned')}
      />
    );
  }

  const done = onboarding.completedSteps.length;
  return (
    <EmptyState
      icon="dna"
      title={done === 0 ? 'Pixel aún no conoce esta marca' : 'Pixel está aprendiendo tu marca'}
      description={
        done === 0
          ? 'Responde el onboarding de marca en 8 pasos. Con tus respuestas, Pixel construirá el ADN de la marca.'
          : `Llevas ${done} de ${ONBOARDING_STEPS.length} pasos. Complétalos para que Pixel genere el ADN de la marca.`
      }
      action={
        <Link to={onboardingHref} className={buttonClasses('primary')}>
          {done === 0 ? 'Empezar onboarding' : 'Continuar onboarding'}
          <Icon name="arrowRight" className="size-4" />
        </Link>
      }
    />
  );
}
