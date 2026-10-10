import {
  CONTENT_PLAN_STATUS_LABELS,
  CONTENT_PLATFORM_LABELS,
  type Campaign,
  type ContentPlanResponse,
  type Project,
} from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { workspaceBasePath } from '../../app/navigation';
import { ApiRequestError } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { getCampaign } from '../campaigns/campaignsApi';
import { useWorkspace } from '../workspaces/workspaceContext';
import { Flash, LoadingBlock, SectionHeading } from '../operations/ui';
import { useFlash } from '../operations/useFlash';
import { useWorkspaceProjects } from '../operations/useProjects';
import {
  acceptContentPlanItem,
  archiveContentPlan,
  generateContentPlan,
  getContentPlan,
  rejectContentPlanItem,
  updateContentPlan,
  updateContentPlanItem,
} from './contentPlansApi';
import { GenerationError } from './ContentPlannerPage';
import { PixelThinking } from './PixelThinking';
import { PlanItemCard, type PlanItemActions } from './PlanItemCard';
import {
  periodLabel,
  plannerCopy,
  PERSONAL_PLANNER_COPY,
  regenerateInput,
  sortItems,
  type PlannerCopy,
} from './plannerLogic';

/** /workspace/:workspaceId/content-planner/:planId — estrategia, pilares y propuestas. */
export function ContentPlanPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const { planId = '' } = useParams();
  const navigate = useNavigate();
  const { flash, show, dismiss } = useFlash();
  const projects = useWorkspaceProjects(workspaceId);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<unknown>(null);
  const copy = plannerCopy(overview);
  const { state, reload } = useResource(`content-plan:${workspaceId}:${planId}`, (signal) =>
    getContentPlan(workspaceId, planId, signal),
  );
  // Campaña del plan (del mismo workspace): para su enlace y para avisar de una estrategia nueva.
  const campaignId = state.status === 'success' ? state.data.plan.campaignId : null;
  const campaign = useResource(
    `content-plan-campaign:${workspaceId}:${campaignId ?? 'none'}`,
    (signal) => (campaignId ? getCampaign(workspaceId, campaignId, signal) : Promise.resolve(null)),
  );

  const actions: PlanItemActions = {
    onAccept: async (item) => {
      await acceptContentPlanItem(workspaceId, planId, item.id);
      reload();
      show({
        message: `Añadido a Contenido: ${item.title}`,
        action: { label: 'Ver', onClick: () => navigate(`${base}/content`) },
      });
    },
    onReject: async (item, reason) => {
      await rejectContentPlanItem(workspaceId, planId, item.id, reason || undefined);
      reload();
      show('Propuesta rechazada. Sigue en el plan por si cambias de idea.');
    },
    onRestore: async (item) => {
      await updateContentPlanItem(workspaceId, planId, item.id, { status: 'proposed' });
      reload();
      show('Propuesta recuperada');
    },
    onSave: async (item, input) => {
      await updateContentPlanItem(workspaceId, planId, item.id, input);
      reload();
      show('Propuesta guardada');
    },
  };

  return (
    <ContentPlanView
      base={base}
      copy={copy}
      campaign={campaign.state.status === 'success' ? campaign.state.data : null}
      state={state}
      projects={projects.all}
      onRetry={reload}
      actions={actions}
      flash={<Flash message={flash?.message ?? null} action={flash?.action} onDismiss={dismiss} />}
      regenerating={regenerating}
      regenerateSlot={
        regenerating ? (
          <PixelThinking workspaceId={workspaceId} copy={copy.thinking} />
        ) : regenerateError !== null ? (
          <GenerationError error={regenerateError} base={base} />
        ) : null
      }
      onRegenerate={(plan) => {
        setRegenerating(true);
        setRegenerateError(null);
        generateContentPlan(workspaceId, regenerateInput(plan))
          .then(({ plan: next }) => {
            setRegenerating(false);
            navigate(`${base}/content-planner/${next.id}`);
          })
          .catch((err: unknown) => {
            setRegenerateError(err);
            setRegenerating(false);
          });
      }}
      onStatus={async (plan, status) => {
        if (status === 'archived') await archiveContentPlan(workspaceId, plan.id);
        else await updateContentPlan(workspaceId, plan.id, { status });
        reload();
        show(`Plan ${CONTENT_PLAN_STATUS_LABELS[status].toLowerCase()}`);
      }}
    />
  );
}

type Plan = ContentPlanResponse['plan'];

export function ContentPlanView({
  base,
  copy = PERSONAL_PLANNER_COPY,
  campaign = null,
  state,
  projects,
  onRetry,
  actions,
  flash,
  regenerating,
  regenerateSlot,
  onRegenerate,
  onStatus,
}: {
  base: string;
  copy?: PlannerCopy;
  /** Campaña del plan (Enterprise), si tiene. */
  campaign?: Campaign | null;
  state: ResourceState<ContentPlanResponse>;
  projects: readonly Project[];
  onRetry: () => void;
  actions: PlanItemActions;
  flash?: ReactNode;
  regenerating: boolean;
  regenerateSlot: ReactNode;
  onRegenerate: (plan: Plan) => void;
  onStatus: (plan: Plan, status: Plan['status']) => Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  const back = (
    <Link
      to={`${base}/content-planner`}
      className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
    >
      <Icon name="arrowLeft" className="size-4" /> Plan de contenido
    </Link>
  );

  if (state.status === 'loading') return <LoadingBlock label="Cargando el plan…" />;
  if (state.status === 'error') {
    if (state.error instanceof ApiRequestError && state.error.status === 404) {
      return (
        <>
          <PageHeader
            eyebrow="404"
            title="Plan no encontrado"
            description="No existe en este Pixel o ya no tienes acceso a él."
          />
          <Link to={`${base}/content-planner`} className={buttonClasses('secondary')}>
            Ver planes
          </Link>
        </>
      );
    }
    return <ErrorState error={state.error} onRetry={onRetry} />;
  }

  const { plan, items } = state.data;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const changeStatus = (status: Plan['status']) => {
    setChanging(true);
    void onStatus(plan, status).finally(() => setChanging(false));
  };
  const nextStatus: Plan['status'] | null =
    plan.status === 'draft' ? 'active' : plan.status === 'active' ? 'completed' : null;

  return (
    <>
      <div className="mb-8">{back}</div>
      {flash}

      <header className="mb-12">
        <p className="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
          <span>{CONTENT_PLAN_STATUS_LABELS[plan.status]}</span>
          <span aria-hidden="true">·</span>
          <span>{periodLabel(plan)}</span>
          {plan.platforms.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {plan.platforms.map((value) => CONTENT_PLATFORM_LABELS[value]).join(', ')}
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
            {plan.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            {nextStatus && (
              <Button
                variant="secondary"
                loading={changing}
                onClick={() => changeStatus(nextStatus)}
              >
                {nextStatus === 'active' ? 'Activar plan' : 'Marcar completado'}
              </Button>
            )}
            {plan.generatedBy === 'pixel' && (
              <Button variant="ghost" loading={regenerating} onClick={() => onRegenerate(plan)}>
                Regenerar
              </Button>
            )}
            {plan.status !== 'archived' && (
              <Button variant="ghost" disabled={changing} onClick={() => changeStatus('archived')}>
                Archivar
              </Button>
            )}
          </div>
        </div>
        {plan.objective && <p className="mt-4 text-sm text-muted">Objetivo: {plan.objective}</p>}
      </header>

      {regenerateSlot && <div className="mb-10">{regenerateSlot}</div>}

      {plan.generation?.mode === 'demo' && (
        <p className="mb-8 flex items-start gap-3 rounded-xl border border-line-strong px-4 py-3 text-sm text-muted">
          <span className="mt-1.5 size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          {copy.demoNotice}
        </p>
      )}

      {plan.strategySummary && (
        <section aria-label="Estrategia" className="mb-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
            {plan.contextType === 'enterprise' ? 'Estrategia editorial' : 'Estrategia'}
          </p>
          <p className="mt-4 max-w-3xl font-display text-xl font-bold leading-snug tracking-tight sm:text-2xl">
            {plan.strategySummary}
          </p>
          {(plan.editorialObjective || plan.distributionRationale) && (
            <dl className="mt-6 grid max-w-3xl gap-5 text-sm sm:grid-cols-2">
              {plan.editorialObjective && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
                    Qué vamos a comunicar
                  </dt>
                  <dd className="mt-1.5 leading-relaxed text-fg">{plan.editorialObjective}</dd>
                </div>
              )}
              {plan.distributionRationale && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
                    Cómo se distribuye
                  </dt>
                  <dd className="mt-1.5 leading-relaxed text-fg">{plan.distributionRationale}</dd>
                </div>
              )}
            </dl>
          )}
          {plan.generation && plan.generation.discardedItems > 0 && (
            <p className="mt-4 text-xs text-subtle">
              Pixel descartó {plan.generation.discardedItems}{' '}
              {plan.generation.discardedItems === 1 ? 'propuesta' : 'propuestas'} que no se apoyaban
              en tu información real o repetían contenido.
            </p>
          )}
        </section>
      )}

      {plan.campaignId && (
        <section
          aria-label="Alineación con la campaña"
          className="mb-12 rounded-2xl border border-line bg-surface p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              Alineación con la campaña
            </p>
            <Link
              to={`${base}/campaigns/${plan.campaignId}`}
              className="inline-flex items-center gap-2 rounded-md border border-line-strong px-2.5 py-1 text-xs text-fg hover:border-fg"
            >
              <Icon name="campaigns" className="size-3.5" />
              Campaña{campaign ? ` · ${campaign.name}` : ''}
            </Link>
          </div>
          {plan.campaignAlignment && (
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-fg">
              {plan.campaignAlignment}
            </p>
          )}
          <p className="mt-3 text-xs text-subtle">
            Creado desde la estrategia de campaña v{plan.campaignStrategyVersion}.
            {campaign?.currentStrategyVersion &&
              plan.campaignStrategyVersion &&
              campaign.currentStrategyVersion > plan.campaignStrategyVersion &&
              ` Existe una estrategia de campaña más reciente (v${campaign.currentStrategyVersion}): este plan no cambia solo.`}
          </p>
        </section>
      )}

      {plan.pillars.length > 0 && (
        <section aria-label="Pilares" className="mb-12">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
            Pilares
          </p>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {plan.pillars.map((pillar) => (
              <li key={pillar.name} className="bg-surface p-5">
                <p className="font-display text-sm font-bold">{pillar.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{pillar.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Propuestas">
        <SectionHeading
          title={plan.contextType === 'enterprise' ? 'Plan de contenido' : 'Propuestas'}
          count={items.length}
          action={
            plan.itemCounts.converted > 0 ? (
              <Link to={`${base}/content`} className="text-sm text-muted hover:text-fg">
                {plan.itemCounts.converted} en Contenido →
              </Link>
            ) : undefined
          }
        />
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-6 py-8 text-center text-sm text-muted">
            Este plan aún no tiene propuestas.
          </p>
        ) : (
          <div className="grid gap-4">
            {sortItems(items).map((item) => (
              <PlanItemCard
                key={item.id}
                item={item}
                projectName={item.projectId ? (projectNames.get(item.projectId) ?? null) : null}
                contentHref={`${base}/content`}
                campaign={
                  item.campaignId
                    ? { name: campaign?.name ?? null, href: `${base}/campaigns/${item.campaignId}` }
                    : null
                }
                actions={actions}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
