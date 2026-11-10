import {
  nextPersonalOnboardingStep,
  PERSONAL_ONBOARDING_STEP_SCHEMAS,
  PERSONAL_ONBOARDING_STEPS,
  PersonalOnboardingStepSchema,
  type PersonalOnboardingStep,
  type PersonalProfileResponse,
  type SavePersonalOnboardingStepInput,
  type Workspace,
} from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { workspaceBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import type { FieldErrors } from '../../lib/forms';
import { useResource } from '../../lib/useResource';
import { WizardLayout } from '../onboarding/WizardLayout';
import { useWorkspace } from '../workspaces/workspaceContext';
import { getPersonalProfile, savePersonalStep } from './personalApi';
import {
  initialPersonalForms,
  PERSONAL_STEP_META,
  personalApiErrors,
  personalZodErrors,
  type PersonalStepForms,
} from './personalSteps';
import { PersonalStepForm } from './PersonalStepForms';

/** /workspace/:workspaceId/personal/onboarding — 8 pasos con guardado progresivo. */
export function PersonalOnboardingPage() {
  const { overview, reload } = useWorkspace();
  const { workspace } = overview;
  const { state, reload: retry } = useResource(`personal-profile:${workspace.id}`, (signal) =>
    getPersonalProfile(workspace.id, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Preparando tu onboarding…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />;

  return (
    <PersonalWizard
      key={workspace.id}
      workspace={workspace}
      initial={state.data}
      onSaved={reload}
    />
  );
}

function PersonalWizard({
  workspace,
  initial,
  onSaved,
}: {
  workspace: Workspace;
  initial: PersonalProfileResponse;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [progress, setProgress] = useState(initial);
  const [forms, setForms] = useState(() =>
    initialPersonalForms(initial.onboarding.answers, { name: workspace.name }),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const base = workspaceBasePath(workspace.id);
  const completed = progress.onboarding.completedSteps;
  const requested = PersonalOnboardingStepSchema.safeParse(searchParams.get('step'));
  const step: PersonalOnboardingStep = requested.success
    ? requested.data
    : nextPersonalOnboardingStep(completed);
  const index = PERSONAL_ONBOARDING_STEPS.indexOf(step);
  const isLast = index === PERSONAL_ONBOARDING_STEPS.length - 1;
  const meta = PERSONAL_STEP_META[step];
  const hasDna = Boolean(progress.profile?.personalDnaVersion);

  const goTo = (target: PersonalOnboardingStep) => {
    setErrors({});
    setFormError(null);
    setSearchParams({ step: target });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateForm = <K extends PersonalOnboardingStep>(key: K, value: PersonalStepForms[K]) =>
    setForms((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = PERSONAL_ONBOARDING_STEP_SCHEMAS[step].safeParse(forms[step]);
    if (!parsed.success) {
      setErrors(personalZodErrors(parsed.error));
      setFormError('Revisa los campos marcados para continuar.');
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const next = await savePersonalStep(workspace.id, {
        step,
        data: forms[step],
      } as SavePersonalOnboardingStepInput);
      setProgress(next);
      onSaved();

      if (next.onboarding.isComplete && next.profile?.personalDnaVersion && isLast) {
        navigate(`${base}/personal/dna?learned=1`);
        return;
      }
      goTo(
        isLast
          ? nextPersonalOnboardingStep(next.onboarding.completedSteps)
          : PERSONAL_ONBOARDING_STEPS[index + 1]!,
      );
    } catch (err) {
      setErrors(personalApiErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardLayout
      eyebrow="Pixel Personal"
      summary={`${completed.length} de ${PERSONAL_ONBOARDING_STEPS.length} pasos · puedes seguir otro día`}
      steps={PERSONAL_ONBOARDING_STEPS.map((key) => ({
        key,
        title: PERSONAL_STEP_META[key].title,
      }))}
      completed={completed}
      current={step}
      onGo={(key) => goTo(key as PersonalOnboardingStep)}
      asideFooter={
        hasDna && (
          <Link
            to={`${base}/personal/dna`}
            className="mt-6 hidden items-center gap-2 text-sm text-muted hover:text-fg lg:inline-flex"
          >
            <Icon name="brand" className="size-4" /> Ver mi ADN actual
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
      <PersonalStepForm
        step={step}
        value={forms[step]}
        onChange={(value) => updateForm(step, value)}
        errors={errors}
      />
    </WizardLayout>
  );
}
