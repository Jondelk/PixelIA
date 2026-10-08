import { CONTENT_PLAN_STATUS_LABELS, type ContentPlanListResponse } from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { workspaceBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { LoadingBlock, StatusTag } from '../operations/ui';
import { generateContentPlan, listContentPlans } from './contentPlansApi';
import { GeneratePlanForm } from './GeneratePlanForm';
import { PixelThinking } from './PixelThinking';
import { generationErrorMessage, periodLabel } from './plannerLogic';

/** /workspace/:workspaceId/content-planner — planes de contenido y "Crear plan con Pixel". */
export function ContentPlannerPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const { state, reload } = useResource(`content-plans:${workspaceId}`, (signal) =>
    listContentPlans(workspaceId, {}, signal),
  );

  return (
    <ContentPlannerView
      base={base}
      state={state}
      onRetry={reload}
      creating={creating || generating}
      onCreate={() => setCreating(true)}
      generator={
        generating ? (
          <PixelThinking workspaceId={workspaceId} />
        ) : (
          <>
            {failure !== null && <GenerationError error={failure} base={base} />}
            <GeneratePlanForm
              busy={generating}
              onCancel={() => {
                setCreating(false);
                setFailure(null);
              }}
              onGenerate={(input) => {
                setGenerating(true);
                setFailure(null);
                generateContentPlan(workspaceId, input)
                  .then(({ plan }) => navigate(`${base}/content-planner/${plan.id}`))
                  .catch((err: unknown) => {
                    setFailure(err);
                    setGenerating(false);
                  });
              }}
            />
          </>
        )
      }
    />
  );
}

export function GenerationError({ error, base }: { error: unknown; base: string }) {
  const { title, reason } = generationErrorMessage(error);
  return (
    <div className="mb-4">
      <Alert>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-muted">{errorMessage(error)}</p>
        {reason === 'personal_context_not_configured' && (
          <Link to={`${base}/personal/onboarding`} className="mt-2 inline-block underline">
            Completar mi onboarding
          </Link>
        )}
      </Alert>
    </div>
  );
}

export function ContentPlannerView({
  base,
  state,
  onRetry,
  creating,
  onCreate,
  generator,
}: {
  base: string;
  state: ResourceState<ContentPlanListResponse>;
  onRetry: () => void;
  creating: boolean;
  onCreate: () => void;
  generator: ReactNode;
}) {
  const plans = state.status === 'success' ? state.data.plans : [];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Trabajo"
          title="Plan de contenido"
          description="Pixel construye contigo una estrategia de contenido a partir de quién eres, lo que quieres conseguir y en qué estás trabajando."
        />
        {!creating && plans.length > 0 && (
          <Button className="mb-8 sm:mb-10" onClick={onCreate}>
            <Icon name="create" className="size-4" /> Crear plan con Pixel
          </Button>
        )}
      </div>

      {creating && <div className="mb-10">{generator}</div>}

      {state.status === 'loading' && <LoadingBlock label="Cargando tus planes…" />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={onRetry} />}
      {state.status === 'success' &&
        (plans.length === 0 ? (
          !creating && (
            <EmptyState
              title="Aún no tienes un plan de contenido."
              description="Elige un periodo y Pixel te propondrá una estrategia y piezas concretas, cada una con su porqué. Tú decides cuáles pasan a Contenido."
              action={
                <Button onClick={onCreate}>
                  <Icon name="create" className="size-4" /> Crear plan con Pixel
                </Button>
              }
            />
          )
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <Reveal key={plan.id}>
                <Link
                  to={`${base}/content-planner/${plan.id}`}
                  className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-7"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag>{CONTENT_PLAN_STATUS_LABELS[plan.status]}</StatusTag>
                    <span className="text-xs text-subtle">{periodLabel(plan)}</span>
                    {plan.generation?.mode === 'demo' && (
                      <span className="text-xs text-subtle">· Modo demo</span>
                    )}
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold tracking-tight">
                    {plan.name}
                  </h3>
                  {plan.strategySummary && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                      {plan.strategySummary}
                    </p>
                  )}
                  <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
                    {plan.itemCounts.proposed} propuestas por revisar · {plan.itemCounts.converted}{' '}
                    en Contenido
                    {plan.itemCounts.rejected > 0 && ` · ${plan.itemCounts.rejected} descartadas`}
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        ))}
      {state.status === 'success' && plans.length > 0 && (
        <p className="mt-6 text-xs text-subtle">
          <Link to={`${base}/content`} className={buttonClasses('ghost', '!px-0')}>
            Ir a Contenido <Icon name="arrowRight" className="size-3.5" />
          </Link>
        </p>
      )}
    </>
  );
}
