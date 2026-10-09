import {
  CONTENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type OperationsSummary,
} from '@pixel/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { useResource, type ResourceState } from '../../lib/useResource';
import { platformFormatLabel } from './labels';
import { getOperationsSummary } from './operationsApi';
import { PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import { DueLabel, PriorityMark } from './ui';

type OverviewCopy = OperationsCopy['overview'];

/**
 * Resumen operacional del Inicio (Personal y Enterprise): solo conteos y próximos elementos reales.
 * No es el Daily Director: no recomienda ni prioriza nada.
 */
export function OperationsOverview({
  workspaceId,
  base,
  copy,
  showCampaigns = false,
}: {
  workspaceId: string;
  base: string;
  copy?: OverviewCopy;
  /** Enterprise: añade el contador de campañas activas. */
  showCampaigns?: boolean;
}) {
  const { state, reload } = useResource(`operations-summary:${workspaceId}`, (signal) =>
    getOperationsSummary(workspaceId, signal),
  );
  return (
    <OperationsOverviewView
      state={state}
      base={base}
      onRetry={reload}
      copy={copy}
      showCampaigns={showCampaigns}
    />
  );
}

export function OperationsOverviewView({
  state,
  base,
  onRetry,
  copy = PERSONAL_OPERATIONS_COPY.overview,
  showCampaigns = false,
}: {
  state: ResourceState<OperationsSummary>;
  base: string;
  onRetry: () => void;
  copy?: OverviewCopy;
  showCampaigns?: boolean;
}) {
  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={onRetry} title={copy.errorTitle} />;
  }
  const summary = state.status === 'success' ? state.data : null;
  const counts = summary?.counts;

  return (
    <section aria-label={copy.label} aria-busy={state.status === 'loading'} className="mb-12">
      <div
        className={[
          'grid gap-px overflow-hidden rounded-2xl border border-line bg-line',
          showCampaigns ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3',
        ].join(' ')}
      >
        {showCampaigns && (
          <Counter
            to={`${base}/campaigns?filter=active`}
            label="Campañas activas"
            value={counts?.activeCampaigns}
          />
        )}
        <Counter
          to={`${base}/projects?filter=active`}
          label="Proyectos activos"
          value={counts?.activeProjects}
        />
        <Counter
          to={`${base}/tasks`}
          label="Tareas pendientes"
          value={counts?.openTasks}
          note={counts?.overdueTasks ? `${counts.overdueTasks} vencidas` : undefined}
        />
        <Counter
          to={`${base}/content?stage=production`}
          label="Contenido en producción"
          value={counts?.contentInProduction}
        />
      </div>

      {summary && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Block
            title="Próximas tareas"
            to={`${base}/tasks?view=upcoming`}
            empty="Sin tareas con fecha próxima."
          >
            {summary.upcomingTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
                <DueLabel iso={task.dueDate} />
                <PriorityMark priority={task.priority} compact />
              </li>
            ))}
          </Block>
          <Block
            title="Proyectos recientes"
            to={`${base}/projects`}
            empty={copy.recentProjectsEmpty}
          >
            {summary.recentProjects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`${base}/projects/${project.id}`}
                  className="flex items-center gap-3 py-2.5 text-sm text-fg hover:text-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-xs text-subtle">
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                  <span className="w-9 text-right text-xs tabular-nums text-muted">
                    {project.progress}%
                  </span>
                </Link>
              </li>
            ))}
          </Block>
          <Block
            title="Contenido próximo"
            to={`${base}/content`}
            empty="Sin contenido con fecha prevista."
          >
            {summary.upcomingContent.map((item) => (
              <li key={item.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.title}</span>
                  <DueLabel iso={item.scheduledFor} />
                </div>
                <p className="mt-0.5 text-xs text-subtle">
                  {[CONTENT_STATUS_LABELS[item.status], platformFormatLabel(item)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </Block>
        </div>
      )}
    </section>
  );
}

function Counter({
  to,
  label,
  value,
  note,
}: {
  to: string;
  label: string;
  value: number | undefined;
  note?: string;
}) {
  return (
    <Link to={to} className="group block bg-surface p-6 transition-colors hover:bg-elevated sm:p-7">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{label}</p>
      <p className="mt-4 font-display text-4xl font-bold tabular-nums tracking-tight">
        {value ?? <span className="text-subtle">—</span>}
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
        {note ? (
          <>
            <span className="size-1.5 bg-alert" aria-hidden="true" />
            {note}
          </>
        ) : (
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            Ver <Icon name="arrowRight" className="inline size-3" />
          </span>
        )}
      </p>
    </Link>
  );
}

function Block({
  title,
  to,
  empty,
  children,
}: {
  title: string;
  to: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">{title}</h2>
        <Link to={to} className="text-xs text-muted hover:text-fg">
          Ver todo
        </Link>
      </div>
      {children.length === 0 ? (
        <p className="py-3 text-sm text-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}
