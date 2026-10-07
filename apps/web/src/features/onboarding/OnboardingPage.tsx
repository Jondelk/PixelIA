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
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
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

export function OnboardingPage() {
  const { company, reload } = useCompany();
  const { state, reload: retry } = useResource(`brand-brain:${company.id}`, (signal) =>
    getBrandBrain(company.id, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-accent" /> Preparando el onboarding…
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
  const percent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

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
    <div className="grid gap-8 lg:grid-cols-[230px_1fr] lg:gap-10">
      <aside aria-label="Progreso del onboarding" className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent/80">
          Brand Brain
        </p>
        <p className="mt-2 text-sm text-muted">
          {company.name} · {completed.length} de {ONBOARDING_STEPS.length} pasos
        </p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Progreso del onboarding"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric to-accent transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ol className="mt-6 hidden space-y-1 lg:block">
          {ONBOARDING_STEPS.map((key, i) => {
            const done = completed.includes(key);
            const current = key === step;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => goTo(key)}
                  aria-current={current ? 'step' : undefined}
                  className={[
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    current
                      ? 'bg-accent/[0.08] text-fg'
                      : 'text-muted hover:bg-white/[0.03] hover:text-fg',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'grid size-6 shrink-0 place-items-center rounded-full border text-[11px]',
                      done
                        ? 'border-accent/60 bg-accent/15 text-accent'
                        : current
                          ? 'border-accent text-accent'
                          : 'border-line-strong text-subtle',
                    ].join(' ')}
                  >
                    {done ? <Icon name="check" className="size-3.5" /> : i + 1}
                  </span>
                  {STEP_META[key].title}
                </button>
              </li>
            );
          })}
        </ol>

        {brain.brandDna && (
          <Link
            to={`${companyBasePath(company.id)}/brand`}
            className="mt-6 hidden items-center gap-2 text-sm text-accent hover:text-accent-soft lg:inline-flex"
          >
            <Icon name="dna" className="size-4" /> Ver el ADN actual
          </Link>
        )}
      </aside>

      <form
        onSubmit={onSubmit}
        noValidate
        className="animate-rise rounded-2xl border border-line bg-surface/80 p-5 sm:p-8"
        key={step}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">
          Paso {index + 1} de {ONBOARDING_STEPS.length} · {meta.title}
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {meta.heading}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{meta.description}</p>

        <div className="mt-8 space-y-5">
          {formError && <Alert>{formError}</Alert>}
          <StepForm
            step={step}
            value={forms[step]}
            onChange={(value) => updateForm(step, value)}
            errors={errors}
          />
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            disabled={index === 0 || saving}
            onClick={() => goTo(ONBOARDING_STEPS[index - 1]!)}
          >
            <Icon name="arrowLeft" className="size-4" /> Atrás
          </Button>
          <Button type="submit" loading={saving}>
            {isLast ? 'Guardar y que Pixel aprenda' : 'Guardar y continuar'}
            {!saving && <Icon name={isLast ? 'sparkle' : 'arrowRight'} className="size-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
