import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type Campaign,
  type CampaignListResponse,
} from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { workspaceBasePath } from '../../app/navigation';
import { apiFieldErrors, type FieldErrors } from '../../lib/forms';
import { errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { PixelThinking } from '../content-planner/PixelThinking';
import { PixelCommand } from '../pixel-command/PixelCommand';
import { InlineEmpty, LoadingBlock, Segmented, StatusTag } from '../operations/ui';
import { useWorkspace } from '../workspaces/workspaceContext';
import { CampaignForm } from './CampaignForm';
import {
  CAMPAIGN_FILTERS,
  campaignFilterStatuses,
  CAMPAIGN_THINKING_COPY,
  campaignGenerationError,
  campaignPeriod,
  emptyCampaignForm,
  isCampaignFilter,
  manualCampaignInput,
  pixelCampaignInput,
  type CampaignFilter,
  type CampaignFormState,
} from './campaignLogic';
import { createCampaign, generateCampaign, listCampaigns } from './campaignsApi';

type Mode = 'manual' | 'pixel' | null;

/**
 * /workspace/:workspaceId/campaigns — campañas de la marca. Lo principal es contarle a Pixel qué se
 * quiere lograr (PixelCommand); el brief detallado y la creación manual siguen como opciones
 * avanzadas (Prompt 14.1, zero-entry-first).
 */
export function CampaignsPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('filter');
  const filter: CampaignFilter = isCampaignFilter(raw) ? raw : 'all';
  const initialMode = searchParams.get('new');
  const [mode, setMode] = useState<Mode>(
    initialMode === 'pixel' ? 'pixel' : initialMode === 'manual' ? 'manual' : null,
  );
  const [form, setForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { state, reload } = useResource(`campaigns:${workspaceId}:${filter}`, (signal) =>
    listCampaigns(workspaceId, { status: campaignFilterStatuses(filter), limit: 100 }, signal),
  );

  const open = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFailure(null);
  };

  /** Valida con el mismo schema que la API y llama a crear (manual) o a generar (Pixel). */
  const prepare = (): (() => Promise<{ id: string }>) | null => {
    if (mode === 'pixel') {
      const result = pixelCampaignInput(form);
      if (!result.ok) {
        setErrors(result.errors);
        return null;
      }
      return async () => (await generateCampaign(workspaceId, result.input)).campaign;
    }
    const result = manualCampaignInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    return () => createCampaign(workspaceId, result.input);
  };

  const submit = async () => {
    const run = prepare();
    if (!run) return;
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      const campaign = await run();
      navigate(`${base}/campaigns/${campaign.id}`, { state: { created: true } });
    } catch (err) {
      // El formulario conserva lo escrito: el usuario corrige o reintenta sin volver a empezar.
      setErrors(apiFieldErrors(err));
      setFailure(err);
      setBusy(false);
    }
  };

  return (
    <CampaignsView
      base={base}
      state={state}
      filter={filter}
      onFilterChange={(next) =>
        setSearchParams(next === 'all' ? {} : { filter: next }, { replace: true })
      }
      onRetry={reload}
      onNew={() => open('manual')}
      onGenerate={() => open('pixel')}
      creating={mode !== null}
      command={
        <PixelCommand
          workspaceId={workspaceId}
          base={base}
          title="¿Qué quieres lograr?"
          placeholder="Cuéntale a Pixel qué quieres lograr: «Una campaña de Amor y Amistad»…"
          contextHint={{ intent: 'create_campaign' }}
          onCompleted={reload}
        />
      }
      panel={
        mode === 'pixel' && busy ? (
          <PixelThinking workspaceId={workspaceId} copy={CAMPAIGN_THINKING_COPY} />
        ) : mode ? (
          <>
            {failure !== null && <CampaignError error={failure} base={base} mode={mode} />}
            <CampaignForm
              mode={mode}
              form={form}
              onChange={setForm}
              errors={errors}
              busy={busy}
              onSubmit={() => void submit()}
              onCancel={() => open(null)}
            />
          </>
        ) : null
      }
    />
  );
}

export function CampaignError({
  error,
  base,
  mode,
}: {
  error: unknown;
  base: string;
  mode: 'manual' | 'pixel';
}) {
  if (Object.keys(apiFieldErrors(error)).length > 0) return null;
  const { title, reason } =
    mode === 'pixel'
      ? campaignGenerationError(error)
      : { title: 'No se pudo crear la campaña', reason: null };
  return (
    <div className="mb-4">
      <Alert>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-muted">{errorMessage(error)}</p>
        {reason === 'brand_dna_missing' && (
          <Link to={base} className="mt-2 inline-block underline">
            Completar el onboarding de la marca
          </Link>
        )}
      </Alert>
    </div>
  );
}

export function CampaignsView({
  base,
  state,
  filter,
  onFilterChange,
  onRetry,
  onNew,
  onGenerate,
  creating,
  command = null,
  panel,
}: {
  base: string;
  state: ResourceState<CampaignListResponse>;
  filter: CampaignFilter;
  onFilterChange: (filter: CampaignFilter) => void;
  onRetry: () => void;
  onNew: () => void;
  onGenerate: () => void;
  creating: boolean;
  /** La entrada de Pixel (lo principal); los formularios quedan como opciones avanzadas. */
  command?: ReactNode;
  panel: ReactNode;
}) {
  const isFirstRun =
    state.status === 'success' && state.data.total === 0 && filter === 'all' && !creating;
  const actions = (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={onGenerate}>
        <Icon name="create" className="size-4" /> Brief detallado
      </Button>
      <Button variant="ghost" onClick={onNew}>
        <Icon name="plus" className="size-4" /> Crear manualmente
      </Button>
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Trabajo"
          title="Campañas"
          description="La estrategia de cada necesidad de negocio, construida desde el ADN de la marca y conectada con su ejecución."
        />
        {!creating && !isFirstRun && <div className="mb-8 sm:mb-10">{actions}</div>}
      </div>

      {creating ? (
        <div className="mb-10">{panel}</div>
      ) : (
        command && <div className="mb-12">{command}</div>
      )}

      {isFirstRun ? (
        <EmptyState
          title="Todavía no hay campañas."
          description="Escríbele a Pixel arriba qué necesita el negocio y construirá la estrategia desde el ADN de la marca. También puedes darle un brief detallado o crearla a mano."
          action={actions}
        />
      ) : (
        <>
          <div className="mb-6">
            <Segmented
              label="Filtrar campañas"
              options={CAMPAIGN_FILTERS}
              value={filter}
              onChange={onFilterChange}
            />
          </div>
          {state.status === 'loading' && <LoadingBlock label="Cargando campañas…" />}
          {state.status === 'error' && <ErrorState error={state.error} onRetry={onRetry} />}
          {state.status === 'success' &&
            (state.data.campaigns.length === 0 ? (
              <InlineEmpty>
                No hay campañas{' '}
                {CAMPAIGN_FILTERS.find((item) => item.id === filter)?.label.toLowerCase()}.
              </InlineEmpty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {state.data.campaigns.map((campaign) => (
                  <Reveal key={campaign.id}>
                    <CampaignCard campaign={campaign} to={`${base}/campaigns/${campaign.id}`} />
                  </Reveal>
                ))}
              </div>
            ))}
        </>
      )}
    </>
  );
}

export function CampaignCard({ campaign, to }: { campaign: Campaign; to: string }) {
  const period = campaignPeriod(campaign);
  const { stats } = campaign;
  return (
    <Link
      to={to}
      className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-7"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag>{CAMPAIGN_STATUS_LABELS[campaign.status]}</StatusTag>
        {campaign.campaignType && (
          <span className="text-xs text-subtle">{CAMPAIGN_TYPE_LABELS[campaign.campaignType]}</span>
        )}
        {campaign.generatedBy === 'pixel' && (
          <span className="text-xs text-subtle">· Estrategia de Pixel</span>
        )}
      </div>
      <h3 className="mt-4 font-display text-lg font-bold leading-snug">{campaign.name}</h3>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{campaign.objective}</p>
      {campaign.keyMessage && <p className="mt-3 text-sm text-fg">«{campaign.keyMessage}»</p>}
      <span className="flex-1" />
      <p className="mt-5 text-xs text-subtle">
        {[
          period,
          `${stats.convertedDeliverables} de ${stats.deliverables} piezas en ejecución`,
          `${stats.projects} proyectos`,
          `${stats.contentItems} contenidos`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </Link>
  );
}
