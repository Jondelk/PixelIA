import {
  nextOnboardingStep,
  ONBOARDING_STEP_SCHEMAS,
  ONBOARDING_STEPS,
  OnboardingStepSchema,
  type BrandBrainResponse,
  type Company,
  type ExtractDocumentsResponse,
  type OnboardingStep,
  type SaveOnboardingStepInput,
} from '@pixel/contracts';
import { useMemo, useState, type FormEvent } from 'react';
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
import { DocumentImport, type ImportSummary } from './DocumentImport';
import {
  emptyFilled,
  filledLabels,
  mergeExtraction,
  missingByStep,
  type FilledFields,
} from './extractionMerge';
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
  /** Lo que Pixel llenó desde documentos y el usuario aún no ha guardado (por paso). */
  const [suggested, setSuggested] = useState<FilledFields>(emptyFilled);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const missing = useMemo(() => missingByStep(forms), [forms]);

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

  /** Fusiona lo extraído de los documentos con el formulario y lleva al primer paso a revisar. */
  function onExtracted(response: ExtractDocumentsResponse) {
    const { forms: next, filled } = mergeExtraction(forms, response.extraction, completed);
    setForms(next);
    setSuggested((current) => {
      const union = emptyFilled();
      for (const key of ONBOARDING_STEPS) {
        union[key] = [...new Set([...current[key], ...filled[key]])];
      }
      return union;
    });
    setImportSummary({ response, filled });
    const first = ONBOARDING_STEPS.find((key) => filled[key].length > 0);
    if (first) goTo(first);
  }

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
      // Guardado = revisado: lo que vino de los documentos deja de marcarse en este paso.
      setSuggested((current) => ({ ...current, [step]: [] }));

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

  const evidence = importSummary?.response.extraction.evidence.filter(
    (item) =>
      item.field.split('.')[0] === step && suggested[step].includes(item.field.split('.')[1] ?? ''),
  );

  const notice =
    suggested[step].length > 0 ? (
      <div className="rounded-lg border border-line-strong bg-elevated px-4 py-3 text-sm">
        <p className="text-fg">
          Pixel llenó desde tus documentos:{' '}
          <span className="font-medium">{filledLabels(step, suggested[step]).join(', ')}</span>.
          Revisa, corrige si hace falta y guarda.
        </p>
        {missing[step].length > 0 && (
          <p className="mt-1 text-muted">
            Aún falta: {missing[step].map((item) => item.label).join(', ')}.
          </p>
        )}
        {evidence && evidence.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted hover:text-fg">
              Ver de dónde salió cada dato
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs text-muted">
              {evidence.map((item, i) => (
                <li key={`${item.field}-${i}`}>
                  <span className="text-fg">{item.source}</span> · «{item.quote}»
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    ) : null;

  return (
    <>
      {!brain.onboarding.isComplete || importSummary ? (
        <DocumentImport
          companyId={company.id}
          summary={importSummary}
          missing={missing}
          onExtracted={onExtracted}
          onGoToStep={goTo}
        />
      ) : null}
      <WizardLayout
        eyebrow="Brand Brain"
        summary={`${company.name} · ${completed.length} de ${ONBOARDING_STEPS.length} pasos`}
        steps={ONBOARDING_STEPS.map((key) => ({
          key,
          title: STEP_META[key].title,
          flagged: suggested[key].length > 0,
        }))}
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
        notice={notice}
      >
        <StepForm
          step={step}
          value={forms[step]}
          onChange={(value) => updateForm(step, value)}
          errors={errors}
        />
      </WizardLayout>
    </>
  );
}
