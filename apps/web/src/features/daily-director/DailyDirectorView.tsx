import {
  DAILY_CONTENT_ACTION_LABELS,
  DAILY_URGENCY_LABELS,
  type AvatarConcept,
  type DailyBriefResponse,
} from '@pixel/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { AvatarStage } from '../avatar3d/AvatarStage';
import { StatusTag } from '../operations/ui';
import {
  generationLabel,
  minutesLabel,
  pad2,
  resourceHref,
  RESOURCE_LINK_LABEL,
  suggestionLink,
  updatedAgo,
} from './dailyLogic';

export type DailyState =
  | { status: 'loading' }
  | { status: 'generating'; previous: DailyBriefResponse | null }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: DailyBriefResponse };

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{children}</p>
);

/**
 * "TU DÍA": la dirección de Pixel para hoy. Responde "¿qué merece mi atención y por qué?", no
 * "¿qué tengo pendiente?" (eso es Tareas). Solo recomendaciones: nada se completa desde aquí.
 */
export function DailyDirectorView({
  base,
  firstName,
  state,
  avatar,
  onRegenerate,
  onRetry,
  timezonePrompt,
  now = new Date(),
}: {
  base: string;
  firstName: string;
  state: DailyState;
  avatar: (AvatarConcept & { id: string }) | null;
  onRegenerate: () => void;
  onRetry: () => void;
  timezonePrompt?: ReactNode;
  now?: Date;
}) {
  const generating = state.status === 'generating';
  const data =
    state.status === 'ready' ? state.data : state.status === 'generating' ? state.previous : null;

  const hero = (
    <section
      aria-label="Tu día"
      aria-busy={generating || state.status === 'loading'}
      className="grid gap-6 overflow-hidden rounded-3xl border border-line bg-surface p-6 sm:p-10 lg:grid-cols-[220px_1fr]"
    >
      <div className="h-52 max-lg:hidden">
        {avatar ? (
          <AvatarStage
            avatar={avatar}
            state={generating ? 'thinking' : 'idle'}
            interactive={false}
            className="!h-full"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Pixi size={120} />
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center">
        <Eyebrow>Tu día · Hola, {firstName}</Eyebrow>
        {generating && (
          <div role="status" aria-live="polite">
            <h1 className="mt-4 font-display text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              Pixel está revisando tu trabajo…
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Lee tus tareas, proyectos, contenido y plan para decirte qué merece tu atención hoy y
              por qué.
            </p>
          </div>
        )}
        {state.status === 'loading' && (
          <p className="mt-4 text-sm text-muted" role="status">
            Cargando tu dirección para hoy…
          </p>
        )}
        {state.status === 'error' && (
          <div className="mt-4">
            <ErrorState
              error={state.error}
              onRetry={onRetry}
              title="No pudimos preparar tu dirección de hoy"
            />
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <h1 className="mt-4 max-w-3xl font-display text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {state.data.brief.summary}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-subtle">
              <span>Actualizado {updatedAgo(state.data.brief.generatedAt, now)}</span>
              <span>{generationLabel(state.data.brief)}</span>
              <Button variant="secondary" className="ml-auto" onClick={onRegenerate}>
                Actualizar dirección
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );

  if (!data || state.status === 'error') return <div className="mb-12">{hero}</div>;
  const { brief, stale } = data;
  const noWork = brief.generation.fallbackReason === 'no_work';

  return (
    <div className="mb-12 space-y-10">
      {hero}

      {stale && !generating && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-sm text-fg"
        >
          <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          <span className="flex-1">Hay cambios en tu trabajo desde esta recomendación.</span>
          <Button variant="ghost" className="!py-1" onClick={onRegenerate}>
            Actualizar
          </Button>
        </div>
      )}

      {timezonePrompt}

      {noWork && (
        <Link to={`${base}/tasks`} className={buttonClasses('primary')}>
          <Icon name="plus" className="size-4" /> Crear una tarea
        </Link>
      )}

      {brief.priorities.length > 0 && (
        <section aria-label="Prioridades de hoy">
          <Eyebrow>
            {brief.facts.openTasks > brief.priorities.length
              ? `Tus prioridades · ${brief.facts.openTasks} tareas abiertas, hoy solo estas`
              : 'Tus prioridades'}
          </Eyebrow>
          <ol className="mt-4 grid gap-4 lg:grid-cols-3">
            {brief.priorities.map((priority) => {
              const href = resourceHref(base, priority.type, priority.resourceId);
              return (
                <li
                  key={`${priority.rank}-${priority.resourceId}`}
                  className="flex flex-col rounded-2xl border border-line bg-surface p-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display text-3xl font-bold tabular-nums text-subtle">
                      {pad2(priority.rank)}
                    </span>
                    <StatusTag>{DAILY_URGENCY_LABELS[priority.urgency]}</StatusTag>
                  </div>
                  <h2 className="mt-4 font-display text-base font-bold leading-snug">
                    {priority.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                    {priority.rationale}
                  </p>
                  {priority.suggestedAction && (
                    <p className="mt-3 text-sm text-fg">{priority.suggestedAction}</p>
                  )}
                  {href && (
                    <Link
                      to={href}
                      className="mt-4 inline-flex items-center gap-2 self-start text-sm text-muted hover:text-fg"
                    >
                      {RESOURCE_LINK_LABEL[priority.type]}{' '}
                      <Icon name="arrowRight" className="size-3.5" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {brief.warnings.length > 0 && (
        <section aria-label="Requiere atención">
          <Eyebrow>Requiere atención</Eyebrow>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {brief.warnings.map((warning) => (
              <li
                key={`${warning.type}-${warning.message}`}
                className="flex gap-3 px-5 py-3.5 text-sm text-fg"
              >
                <span className="mt-2 size-1.5 shrink-0 bg-alert" aria-hidden="true" />
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {brief.contentSuggestion && (
          <section
            aria-label="Contenido"
            className="flex flex-col rounded-2xl border border-line bg-surface p-6"
          >
            <Eyebrow>
              Contenido · {DAILY_CONTENT_ACTION_LABELS[brief.contentSuggestion.suggestedAction]}
            </Eyebrow>
            <h2 className="mt-3 font-display text-base font-bold">
              {brief.contentSuggestion.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
              {brief.contentSuggestion.reason}
            </p>
            <Link
              to={suggestionLink(base, brief.contentSuggestion).href}
              className={`${buttonClasses('secondary')} mt-5 self-start`}
            >
              {suggestionLink(base, brief.contentSuggestion).label}
            </Link>
          </section>
        )}

        {brief.focusBlocks.length > 0 && (
          <section
            aria-label="Enfoque recomendado"
            className="rounded-2xl border border-line bg-surface p-6"
          >
            <Eyebrow>Enfoque recomendado</Eyebrow>
            <ol className="mt-4 space-y-4">
              {brief.focusBlocks.map((block) => {
                const minutes = minutesLabel(block);
                return (
                  <li key={block.order} className="flex gap-4">
                    <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-subtle">
                      Bloque {block.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{block.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{block.objective}</p>
                      {minutes && <p className="mt-0.5 text-xs text-subtle">{minutes}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      {brief.closingNote && <p className="text-sm text-muted">{brief.closingNote}</p>}
    </div>
  );
}
