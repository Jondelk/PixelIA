import {
  CONTENT_PLAN_STATUS_LABELS,
  CreateContentPlanSchema,
  type Campaign,
  type ContentPlanListResponse,
} from '@pixel/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { MoreOptions } from '../../components/MoreOptions';
import { PresenceFigure, WithAmbientPixel } from '../presence/AmbientPixel';
import { ErrorState } from '../../components/ErrorState';
import { TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { companyBasePath, workspaceBasePath } from '../../app/navigation';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { listCampaigns } from '../campaigns/campaignsApi';
import { useWorkspace } from '../workspaces/workspaceContext';
import { LoadingBlock, StatusTag } from '../operations/ui';
import { CampaignSummary } from './CampaignSummary';
import { createContentPlan, generateContentPlan, listContentPlans } from './contentPlansApi';
import { GeneratePlanForm } from './GeneratePlanForm';
import { PixelThinking } from './PixelThinking';
import { PixelCommand } from '../pixel-command/PixelCommand';
import {
  generationErrorMessage,
  nextMonday,
  periodEnd,
  periodLabel,
  plannerCopy,
  PERSONAL_PLANNER_COPY,
  type PlannerCopy,
} from './plannerLogic';

type Mode = 'pixel' | 'manual' | null;

/**
 * /workspace/:workspaceId/content-planner — la misma pantalla para Personal y Enterprise. Lo
 * principal es decirle a Pixel qué se quiere comunicar (PixelCommand: resuelve periodo, campaña,
 * plataformas y frecuencia del lenguaje y del contexto). El formulario del Prompt 14 queda como
 * "Opciones avanzadas" y "Nuevo plan" (manual) sigue disponible. En Enterprise, `?campaign=<id>`
 * preselecciona la campaña y abre las opciones avanzadas.
 */
export function ContentPlannerPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const copy = plannerCopy(overview);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get('campaign') ?? '';
  const [mode, setMode] = useState<Mode>(searchParams.has('new') || preselected ? 'pixel' : null);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const { state, reload } = useResource(`content-plans:${workspaceId}`, (signal) =>
    listContentPlans(workspaceId, {}, signal),
  );
  // Solo Enterprise tiene campañas (las de este workspace; la API no devuelve otras).
  const campaigns = useResource(`planner-campaigns:${workspaceId}:${copy.enterprise}`, (signal) =>
    copy.enterprise
      ? listCampaigns(workspaceId, { limit: 100 }, signal).then((list) => list.campaigns)
      : Promise.resolve<Campaign[]>([]),
  );
  const campaignList = campaigns.state.status === 'success' ? campaigns.state.data : [];
  const companyHome = overview.company ? companyBasePath(overview.company.id) : base;

  return (
    <ContentPlannerView
      base={base}
      copy={copy}
      state={state}
      campaigns={campaignList}
      onRetry={reload}
      creating={mode !== null || generating}
      command={
        <PixelCommand
          workspaceId={workspaceId}
          base={base}
          title="¿Qué quieres comunicar?"
          placeholder="Por ejemplo: «Necesito contenido para esta semana sobre el lanzamiento»"
          contextHint={{ intent: 'plan_content' }}
          onCompleted={reload}
        />
      }
      onCreate={() => setMode('pixel')}
      onCreateManual={() => setMode('manual')}
      generator={
        mode === 'manual' ? (
          <ManualPlanForm
            onCancel={() => setMode(null)}
            onCreate={async (input) => {
              const { plan } = await createContentPlan(workspaceId, input);
              navigate(`${base}/content-planner/${plan.id}`);
            }}
          />
        ) : (
          <>
            {generating && <PixelThinking workspaceId={workspaceId} copy={copy.thinking} />}
            {/* El formulario sigue montado (oculto) mientras genera: si falla, nada se pierde. */}
            <div hidden={generating}>
              {failure !== null && (
                <GenerationError error={failure} base={base} companyHome={companyHome} />
              )}
              {(!copy.enterprise || campaigns.state.status !== 'loading') && (
                <GeneratePlanForm
                  busy={generating}
                  copy={copy}
                  campaigns={
                    copy.enterprise
                      ? campaignList.filter((c) => c.status !== 'archived')
                      : undefined
                  }
                  initialCampaignId={
                    campaignList.some((c) => c.id === preselected) ? preselected : ''
                  }
                  campaignSummary={(campaign) => (
                    <CampaignSummary workspaceId={workspaceId} campaign={campaign} />
                  )}
                  onCancel={() => {
                    setMode(null);
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
              )}
            </div>
          </>
        )
      }
    />
  );
}

export function GenerationError({
  error,
  base,
  companyHome,
}: {
  error: unknown;
  base: string;
  companyHome?: string;
}) {
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
        {reason === 'brand_dna_missing' && (
          <Link to={companyHome ?? base} className="mt-2 inline-block underline">
            Completar el onboarding de la marca
          </Link>
        )}
        {reason === 'campaign_strategy_missing' && (
          <Link to={`${base}/campaigns`} className="mt-2 inline-block underline">
            Ir a Campañas
          </Link>
        )}
      </Alert>
    </div>
  );
}

/** Plan manual (sin Pixel): nombre, inicio y duración. Las piezas se añaden en Contenido. */
function ManualPlanForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { name: string; startDate: string; endDate: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => nextMonday());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = { name, startDate, endDate: startDate ? periodEnd(startDate, 14) : '' };
    const parsed = CreateContentPlanSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      await onCreate(input);
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFailure(err);
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label="Nuevo plan"
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <TextField
          label="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          maxLength={120}
          autoFocus
          required
        />
        <TextField
          label="Empieza el"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          error={errors.startDate ?? errors.endDate}
          hint={startDate ? `Dos semanas, hasta el ${periodEnd(startDate, 14)}` : undefined}
        />
      </div>
      {failure !== null && Object.keys(apiFieldErrors(failure)).length === 0 && (
        <Alert>{errorMessage(failure)}</Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}>
          Crear plan
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function ContentPlannerView({
  base,
  copy = PERSONAL_PLANNER_COPY,
  state,
  campaigns = [],
  onRetry,
  creating,
  onCreate,
  onCreateManual,
  command = null,
  generator,
}: {
  base: string;
  copy?: PlannerCopy;
  state: ResourceState<ContentPlanListResponse>;
  campaigns?: readonly Campaign[];
  onRetry: () => void;
  creating: boolean;
  onCreate: () => void;
  onCreateManual?: () => void;
  /** La entrada de Pixel (lo principal); el formulario queda como opciones avanzadas. */
  command?: ReactNode;
  generator: ReactNode;
}) {
  const plans = state.status === 'success' ? state.data.plans : [];
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  // Las rutas manuales siguen a un clic, con menos peso que la entrada de Pixel (Prompt 17).
  const actions = (
    <MoreOptions>
      <Button variant="secondary" onClick={onCreate}>
        <Icon name="create" className="size-4" /> Opciones avanzadas
      </Button>
      {onCreateManual && (
        <Button variant="ghost" onClick={onCreateManual}>
          <Icon name="plus" className="size-4" /> Nuevo plan
        </Button>
      )}
    </MoreOptions>
  );
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Trabajo" title={copy.title} description={copy.description} />
        {!creating && plans.length > 0 && <div className="mb-8 sm:mb-10">{actions}</div>}
      </div>

      {creating ? (
        <div className="mb-10">{generator}</div>
      ) : (
        command && (
          <div className="mb-12">
            <WithAmbientPixel>
              {command}
              <p className="mt-3 text-xs text-subtle">
                Pixel ya conoce el ADN y tus preferencias creativas. Solo dime qué necesitas.
              </p>
            </WithAmbientPixel>
          </div>
        )
      )}

      {state.status === 'loading' && <LoadingBlock label={copy.loading} />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={onRetry} />}
      {state.status === 'success' &&
        (plans.length === 0 ? (
          !creating && (
            <EmptyState
              figure={<PresenceFigure />}
              title={copy.emptyTitle}
              description={copy.emptyDescription}
              action={actions}
            />
          )
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const campaign = plan.campaignId ? campaignNames.get(plan.campaignId) : null;
              return (
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
                    {campaign && (
                      <p className="mt-2 text-xs text-muted">
                        Campaña · {campaign}
                        {plan.campaignStrategyVersion
                          ? ` · estrategia v${plan.campaignStrategyVersion}`
                          : ''}
                      </p>
                    )}
                    {plan.strategySummary && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                        {plan.strategySummary}
                      </p>
                    )}
                    <span className="flex-1" />
                    <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
                      {plan.itemCounts.proposed} propuestas por revisar ·{' '}
                      {plan.itemCounts.converted} en Contenido
                      {plan.itemCounts.rejected > 0 && ` · ${plan.itemCounts.rejected} descartadas`}
                    </p>
                  </Link>
                </Reveal>
              );
            })}
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
