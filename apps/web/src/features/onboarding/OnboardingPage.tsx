import {
  nextOnboardingStep,
  ONBOARDING_STEP_SCHEMAS,
  ONBOARDING_STEPS,
  OnboardingStepSchema,
  type BrandBrainResponse,
  type Company,
  type OnboardingStep,
  type SaveOnboardingStepInput,
} from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { useResource } from '../../lib/useResource';
import { getBrandBrain, saveOnboardingStep } from '../brand/brandApi';
import { useCompany } from '../companies/companyContext';
import { StepForm } from './StepForms';
import { initialForms, STEP_META, type StepForms } from './steps';
import { WizardLayout } from './WizardLayout';

export function OnboardingPage() {
  const { company, reload } = useCompany();
  const { state, reload: retry } = useResource(`brand-brain:${company.id}`, (signal) =>
    getBrandBrain(company.id, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Preparando el onboarding…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />;

  return (
    <OnboardingWizard key={company.id} company={company} initial={state.data} onSaved={reload} />
  );
}

/** Errores de la API vienen como "data.<campo>": se muestran junto al campo. */
function stepFieldErrors(err: unknown): FieldErrors {
  const errors: FieldErrors = {};
  for (const [path, message] of Object.entries(apiFieldErrors(err))) {
    const field = path.replace(/^data\./, '').split('.')[0];
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}

function OnboardingWizard({
  company,
  initial,
  onSaved,
}: {
  company: Company;
  initial: BrandBrainResponse;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [brain, setBrain] = useState(initial);
  const [forms, setForms] = useState(() => initialForms(initial.onboarding.answers, company));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const completed = brain.onboarding.completedSteps;
  const requested = OnboardingStepSchema.safeParse(searchParams.get('step'));
  const step: OnboardingStep = requested.success ? requested.data : nextOnboardingStep(completed);
  const index = ONBOARDING_STEPS.indexOf(step);
  const isLast = index === ONBOARDING_STEPS.length - 1;
  const meta = STEP_META[step];

  const goTo = (target: OnboardingStep) => {
    setErrors({});
    setFormError(null);
    setSearchParams({ step: target });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateForm = <K extends OnboardingStep>(key: K, value: StepForms[K]) =>
    setForms((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = ONBOARDING_STEP_SCHEMAS[step].safeParse(forms[step]);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError('Revisa los campos marcados para continuar.');
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const next = await saveOnboardingStep(company.id, {
        step,
        data: forms[step],
      } as SaveOnboardingStepInput);
      setBrain(next);
      onSaved();

      if (next.onboarding.isComplete && next.brandDna && isLast) {
        navigate(`${companyBasePath(company.id)}/brand?learned=1`);
        return;
      }
      const pending = next.onboarding.completedSteps;
      goTo(isLast ? nextOnboardingStep(pending) : ONBOARDING_STEPS[index + 1]!);
    } catch (err) {
      setErrors(stepFieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardLayout
      eyebrow="Brand Brain"
      summary={`${company.name} · ${completed.length} de ${ONBOARDING_STEPS.length} pasos`}
      steps={ONBOARDING_STEPS.map((key) => ({ key, title: STEP_META[key].title }))}
      completed={completed}
      current={step}
      onGo={(key) => goTo(key as OnboardingStep)}
      asideFooter={
        brain.brandDna && (
          <Link
            to={`${companyBasePath(company.id)}/brand`}
            className="mt-6 hidden items-center gap-2 text-sm text-muted hover:text-fg lg:inline-flex"
          >
            <Icon name="brand" className="size-4" /> Ver el ADN actual
          </Link>
        )
      }
      heading={meta.heading}
      description={meta.description}
      formError={formError}
      saving={saving}
      submitLabel={isLast ? 'Guardar y que Pixel aprenda' : 'Guardar y continuar'}
      submitIcon={isLast ? 'create' : 'arrowRight'}
      onSubmit={onSubmit}
    >
      <StepForm
        step={step}
        value={forms[step]}
        onChange={(value) => updateForm(step, value)}
        errors={errors}
      />
    </WizardLayout>
  );
}
