import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  CampaignStatusSchema,
  type Campaign,
  type CampaignDeliverable,
  type CampaignStatus,
  type CampaignStrategyResponse,
  type ContentItemListResponse,
  type ProjectListResponse,
} from '@pixel/contracts';
import { useCallback, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { workspaceBasePath } from '../../app/navigation';
import { ApiRequestError, errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { PixelThinking } from '../content-planner/PixelThinking';
import { listContent } from '../operations/contentApi';
import { contentListActions } from '../operations/contentActions';
import { ContentList, type ContentListActions } from '../operations/ContentList';
import { labelOptions } from '../operations/labels';
import { ProjectCard } from '../operations/ProjectCard';
import { listProjects } from '../operations/projectsApi';
import { Flash, InlineEmpty, LoadingBlock, Segmented } from '../operations/ui';
import { useFlash } from '../operations/useFlash';
import { useWorkspace } from '../workspaces/workspaceContext';
import {
  CAMPAIGN_TABS,
  CAMPAIGN_THINKING_COPY,
  campaignGenerationError,
  campaignPeriod,
  conversionFeedback,
  isCampaignTab,
  type CampaignTab,
} from './campaignLogic';
import {
  acceptDeliverable,
  getCampaign,
  getStrategy,
  listDeliverables,
  regenerateStrategy,
  rejectDeliverable,
  updateCampaign,
  updateDeliverable,
} from './campaignsApi';
import { DeliverableCard, type DeliverableActions } from './DeliverableCard';
import { StrategyView } from './StrategyView';

const statusOptions = labelOptions(CAMPAIGN_STATUS_LABELS, CampaignStatusSchema.options);

/** /workspace/:workspaceId/campaigns/:campaignId — la estrategia y su conexión con la ejecución. */
export function CampaignDetailPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const { campaignId = '' } = useParams();
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;
  const { flash, show, dismiss } = useFlash(justCreated ? 'Campaña creada' : undefined);
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: CampaignTab = isCampaignTab(raw) ? raw : 'strategy';
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<unknown>(null);

  const key = `${workspaceId}:${campaignId}`;
  const campaign = useResource(`campaign:${key}`, (signal) =>
    getCampaign(workspaceId, campaignId, signal),
  );
  const strategy = useResource(`campaign-strategy:${key}:${version ?? 'current'}`, (signal) =>
    getStrategy(workspaceId, campaignId, version, signal),
  );
  const deliverables = useResource(`campaign-deliverables:${key}`, (signal) =>
    listDeliverables(workspaceId, campaignId, signal),
  );
  // Solo recursos del MISMO workspace con este campaignId (la API filtra por ambos).
  const projects = useResource(`campaign-projects:${key}`, (signal) =>
    listProjects(workspaceId, { campaignId, limit: 100 }, signal),
  );
  const content = useResource(`campaign-content:${key}`, (signal) =>
    listContent(workspaceId, { campaignId, limit: 100 }, signal),
  );
  const reloadCampaign = campaign.reload;
  const reloadDeliverables = deliverables.reload;
  const reloadProjects = projects.reload;
  const reloadContent = content.reload;
  const onConverted = useCallback(() => {
    reloadCampaign();
    reloadDeliverables();
    reloadProjects();
    reloadContent();
  }, [reloadCampaign, reloadDeliverables, reloadProjects, reloadContent]);

  const deliverableActions: DeliverableActions = {
    onAccept: async (deliverable) => {
      const result = await acceptDeliverable(workspaceId, campaignId, deliverable.id);
      onConverted();
      const feedback = conversionFeedback(result, base);
      if (feedback) show({ message: `${feedback.message}: ${deliverable.title}` });
    },
    onReject: async (deliverable) => {
      await rejectDeliverable(workspaceId, campaignId, deliverable.id);
      reloadDeliverables();
      reloadCampaign();
      show({ message: `Pieza rechazada: ${deliverable.title}` });
    },
    onSave: async (deliverable, input) => {
      await updateDeliverable(workspaceId, campaignId, deliverable.id, input);
      reloadDeliverables();
      show({ message: 'Pieza guardada' });
    },
  };

  return (
    <CampaignDetailView
      base={base}
      campaign={campaign.state}
      strategy={strategy.state}
      deliverables={deliverables.state}
      projects={projects.state}
      content={content.state}
      tab={tab}
      onTabChange={(next) =>
        setSearchParams(next === 'strategy' ? {} : { tab: next }, { replace: true })
      }
      onRetry={() => {
        campaign.reload();
        strategy.reload();
        onConverted();
      }}
      flash={<Flash message={flash?.message ?? null} action={flash?.action} onDismiss={dismiss} />}
      deliverableActions={deliverableActions}
      contentActions={contentListActions(workspaceId, { onChanged: onConverted, notify: show })}
      onVersionChange={setVersion}
      onStatusChange={async (status) => {
        await updateCampaign(workspaceId, campaignId, { status });
        reloadCampaign();
        show({ message: `Campaña: ${CAMPAIGN_STATUS_LABELS[status].toLowerCase()}` });
      }}
      regenerating={regenerating}
      regenerateError={regenerateError}
      thinking={<PixelThinking workspaceId={workspaceId} copy={CAMPAIGN_THINKING_COPY} />}
      onRegenerate={() => {
        setRegenerating(true);
        setRegenerateError(null);
        regenerateStrategy(workspaceId, campaignId)
          .then(({ strategy: next }) => {
            setVersion(undefined);
            strategy.reload();
            onConverted();
            show({ message: `Nueva versión de la estrategia: v${next.version}` });
          })
          .catch(setRegenerateError)
          .finally(() => setRegenerating(false));
      }}
    />
  );
}

export function CampaignDetailView({
  base,
  campaign,
  strategy,
  deliverables,
  projects,
  content,
  tab,
  onTabChange,
  onRetry,
  flash,
  deliverableActions,
  contentActions,
  onVersionChange,
  onStatusChange,
  regenerating,
  regenerateError,
  thinking,
  onRegenerate,
}: {
  base: string;
  campaign: ResourceState<Campaign>;
  strategy: ResourceState<CampaignStrategyResponse>;
  deliverables: ResourceState<CampaignDeliverable[]>;
  projects: ResourceState<ProjectListResponse>;
  content: ResourceState<ContentItemListResponse>;
  tab: CampaignTab;
  onTabChange: (tab: CampaignTab) => void;
  onRetry: () => void;
  flash?: ReactNode;
  deliverableActions: DeliverableActions;
  contentActions: ContentListActions;
  onVersionChange: (version: number) => void;
  onStatusChange: (status: CampaignStatus) => Promise<void>;
  regenerating: boolean;
  regenerateError: unknown;
  thinking: ReactNode;
  onRegenerate: () => void;
}) {
  const [statusError, setStatusError] = useState<unknown>(null);
  const backLink = (
    <Link
      to={`${base}/campaigns`}
      className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
    >
      <Icon name="arrowLeft" className="size-4" /> Campañas
    </Link>
  );

  if (campaign.status === 'loading') return <LoadingBlock label="Cargando campaña…" />;
  if (campaign.status === 'error') {
    if (campaign.error instanceof ApiRequestError && campaign.error.status === 404) {
      return (
        <>
          <PageHeader
            eyebrow="404"
            title="Campaña no encontrada"
            description="No existe en este Pixel o ya no tienes acceso a ella."
          />
          {backLink}
        </>
      );
    }
    return <ErrorState error={campaign.error} onRetry={onRetry} />;
  }

  const data = campaign.data;
  const period = campaignPeriod(data);
  const facts: [string, string | null][] = [
    ['Objetivo', data.objective],
    ['Periodo', period],
    ['Producto o servicio', data.productOrService],
    ['Público', data.targetAudience.length ? data.targetAudience.join(' · ') : null],
    ['Canales', data.channels.length ? data.channels.join(' · ') : null],
  ];
  const counts: Partial<Record<CampaignTab, number>> = {
    deliverables: data.stats.deliverables,
    projects: data.stats.projects,
    content: data.stats.contentItems,
  };

  return (
    <>
      <div className="mb-8">{backLink}</div>
      {flash}
      <header className="mb-10">
        <p className="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
          <span>Campaña</span>
          {data.campaignType && (
            <>
              <span aria-hidden="true">·</span>
              <span>{CAMPAIGN_TYPE_LABELS[data.campaignType]}</span>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <h1 className="max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
            {data.name}
          </h1>
          <SelectField<CampaignStatus>
            label="Estado"
            value={data.status}
            options={statusOptions}
            onValueChange={(value) => {
              if (!value || value === data.status) return;
              setStatusError(null);
              onStatusChange(value).catch(setStatusError);
            }}
            className="w-44"
          />
        </div>
        {statusError !== null && (
          <div className="mt-4">
            <Alert>{errorMessage(statusError)}</Alert>
          </div>
        )}
        <dl className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {facts
            .filter((fact): fact is [string, string] => Boolean(fact[1]))
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</dt>
                <dd className="mt-1.5 text-sm text-fg">{value}</dd>
              </div>
            ))}
        </dl>
      </header>

      <div className="mb-8">
        <Segmented
          label="Secciones de la campaña"
          options={CAMPAIGN_TABS.map((item) => ({ ...item, count: counts[item.id] }))}
          value={tab}
          onChange={onTabChange}
        />
      </div>

      {tab === 'strategy' && (
        <StrategySection
          strategy={strategy}
          hasStrategy={data.currentStrategyVersion !== null}
          onRetry={onRetry}
          onVersionChange={onVersionChange}
          regenerating={regenerating}
          regenerateError={regenerateError}
          thinking={thinking}
          onRegenerate={onRegenerate}
        />
      )}
      {tab === 'deliverables' && (
        <Collection state={deliverables} onRetry={onRetry} label="Cargando piezas…">
          {(items) =>
            items.length === 0 ? (
              <InlineEmpty>
                Aún no hay piezas. Pídele a Pixel la estrategia y propondrá las que la campaña
                necesita.
              </InlineEmpty>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((item) => (
                  <DeliverableCard
                    key={`${item.id}:${item.updatedAt}`}
                    deliverable={item}
                    base={base}
                    actions={deliverableActions}
                  />
                ))}
              </div>
            )
          }
        </Collection>
      )}
      {tab === 'projects' && (
        <Collection state={projects} onRetry={onRetry} label="Cargando proyectos…">
          {(list) =>
            list.projects.length === 0 ? (
              <InlineEmpty>
                Ningún proyecto todavía: acepta una pieza de producción (diseño, foto, video…) para
                crearlo.
              </InlineEmpty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {list.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    to={`${base}/projects/${project.id}`}
                  />
                ))}
              </div>
            )
          }
        </Collection>
      )}
      {tab === 'content' && (
        <Collection state={content} onRetry={onRetry} label="Cargando contenido…">
          {(list) =>
            list.contentItems.length === 0 ? (
              <InlineEmpty>
                Ningún contenido todavía: acepta una pieza de contenido para llevarla a producción.
              </InlineEmpty>
            ) : (
              <ContentList
                items={list.contentItems}
                projects={[]}
                showStatus
                actions={contentActions}
              />
            )
          }
        </Collection>
      )}
    </>
  );
}

function StrategySection({
  strategy,
  hasStrategy,
  onRetry,
  onVersionChange,
  regenerating,
  regenerateError,
  thinking,
  onRegenerate,
}: {
  strategy: ResourceState<CampaignStrategyResponse>;
  hasStrategy: boolean;
  onRetry: () => void;
  onVersionChange: (version: number) => void;
  regenerating: boolean;
  regenerateError: unknown;
  thinking: ReactNode;
  onRegenerate: () => void;
}) {
  if (regenerating) return <>{thinking}</>;
  const error = regenerateError !== null && (
    <div className="mb-6">
      <Alert>
        <p className="font-medium">{campaignGenerationError(regenerateError).title}</p>
        <p className="mt-1 text-muted">{errorMessage(regenerateError)}</p>
      </Alert>
    </div>
  );
  const action = (
    <Button variant={hasStrategy ? 'secondary' : 'primary'} onClick={onRegenerate}>
      <Icon name="create" className="size-4" />{' '}
      {hasStrategy ? 'Regenerar estrategia' : 'Crear estrategia con Pixel'}
    </Button>
  );

  if (!hasStrategy) {
    return (
      <>
        {error}
        <section className="rounded-2xl border border-line bg-surface px-6 py-12 text-center sm:px-10">
          <h2 className="font-display text-lg font-bold">Esta campaña aún no tiene estrategia.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Pixel puede construirla desde el ADN de la marca y el objetivo de la campaña, y proponer
            las piezas que necesita.
          </p>
          <div className="mt-8 flex justify-center">{action}</div>
        </section>
      </>
    );
  }
  return (
    <>
      {error}
      <div className="mb-6 flex justify-end">{action}</div>
      <Collection state={strategy} onRetry={onRetry} label="Cargando estrategia…">
        {(data) =>
          data.strategy ? (
            <StrategyView
              strategy={data.strategy}
              versions={data.versions}
              onVersionChange={onVersionChange}
            />
          ) : (
            <InlineEmpty>No se encontró la estrategia.</InlineEmpty>
          )
        }
      </Collection>
    </>
  );
}

function Collection<T>({
  state,
  onRetry,
  label,
  children,
}: {
  state: ResourceState<T>;
  onRetry: () => void;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <LoadingBlock label={label} />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}
