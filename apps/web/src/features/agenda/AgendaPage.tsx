import type { AgendaView, AgendaViewKind } from '@pixel/contracts';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { workspaceBasePath } from '../../app/navigation';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';
import { useResource } from '../../lib/useResource';
import { CalendarConnectButton, CalendarReturnNotice } from '../calendar/CalendarConnection';
import { PixelCommand } from '../pixel-command/PixelCommand';
import { useWorkspace } from '../workspaces/workspaceContext';
import { getAgenda } from './agendaApi';
import {
  AGENDA_TABS,
  anchorFromParam,
  horizonFromParam,
  nextHorizon,
  REORGANIZE_PLACEHOLDER,
  viewFromParam,
} from './agendaLogic';
import {
  AgendaLegend,
  MonthView,
  TodayView,
  UpcomingView,
  WeekView,
  type AskPixel,
} from './AgendaViews';

/**
 * «Mi agenda» (Prompt 20, docs/PERSONAL-AGENDA.md): cómo está organizado tu tiempo. Hoy · Semana ·
 * Mes · Próximos en una sola ruta (`?view=`, `?anchor=`, `?horizon=`), recargable. Ver es libre (no
 * pide confirmación); cambiar es hablar con Pixel: propuesta → «Guardar»/«Mover» → Action Foundation.
 */
export function AgendaPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const [params, setParams] = useSearchParams();
  const view = viewFromParam(params.get('view'));
  const anchor = anchorFromParam(params.get('anchor'));
  const horizon = horizonFromParam(params.get('horizon'));
  const { state, reload } = useResource(
    `agenda:${workspaceId}:${view}:${anchor ?? 'hoy'}:${view === 'upcoming' ? horizon : ''}`,
    (signal) => getAgenda(workspaceId, { view, anchor, horizon }, signal),
  );

  // «Reorganizar con Pixel»: la entrada de Pixel en esta pantalla (el Dock no aparece aquí).
  const [conversation, setConversation] = useState<{
    draft: string;
    nonce: number;
    resource?: { type: 'task'; id: string };
  } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const ask: AskPixel = (draft, resource) => {
    setConversation((current) => ({ draft, resource, nonce: (current?.nonce ?? 0) + 1 }));
    requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      panel.current?.querySelector('textarea')?.focus();
    });
  };

  const go = (next: { view?: AgendaViewKind; anchor?: string | null; horizon?: number | null }) => {
    const search = new URLSearchParams();
    search.set('view', next.view ?? view);
    const nextAnchor = next.anchor === undefined ? anchor : next.anchor;
    if (nextAnchor) search.set('anchor', nextAnchor);
    if ((next.view ?? view) === 'upcoming' && next.horizon)
      search.set('horizon', String(next.horizon));
    setParams(search, { replace: false });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Pixel Personal"
          title="Mi agenda"
          description="Cómo está organizado tu tiempo: tus compromisos, lo que Pixel organizó y lo que falta por organizar."
        />
        <Button onClick={() => ask('')}>
          <Icon name="pencil" className="size-4" /> Reorganizar con Pixel
        </Button>
      </div>

      <CalendarReturnNotice />

      {conversation && (
        <div
          ref={panel}
          className="scroll-mt-24 rounded-2xl border border-line-strong bg-surface p-5 sm:p-7"
        >
          <PixelCommand
            key={conversation.nonce}
            workspaceId={workspaceId}
            base={base}
            title="¿Qué quieres cambiar?"
            placeholder={REORGANIZE_PLACEHOLDER}
            thinkingAvatar="none"
            calendarReturnTo="agenda"
            draft={conversation.draft}
            contextHint={conversation.resource ? { resource: conversation.resource } : undefined}
            onCompleted={() => reload()}
          />
          <button
            type="button"
            onClick={() => setConversation(null)}
            className="mt-4 text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Cerrar conversación
          </button>
        </div>
      )}

      <AgendaTabs view={view} onSelect={(next) => go({ view: next, anchor: null })} />

      <div
        role="tabpanel"
        id={`agenda-panel-${view}`}
        aria-labelledby={`agenda-tab-${view}`}
        className="space-y-6"
      >
        {state.status === 'loading' && <AgendaSkeleton />}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={reload} title="No pude cargar tu agenda" />
        )}
        {state.status === 'success' && (
          <AgendaBody
            agenda={state.data}
            workspaceId={workspaceId}
            base={base}
            onAsk={ask}
            onNavigate={(nextAnchor) => go({ anchor: nextAnchor })}
            onMore={() => go({ horizon: nextHorizon(state.data.horizonDays ?? horizon) })}
          />
        )}
      </div>
    </div>
  );
}

/** Pestañas accesibles (roles, flechas izquierda/derecha, foco visible). */
export function AgendaTabs({
  view,
  onSelect,
}: {
  view: AgendaViewKind;
  onSelect: (view: AgendaViewKind) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      AGENDA_TABS[
        (index + (event.key === 'ArrowRight' ? 1 : -1) + AGENDA_TABS.length) % AGENDA_TABS.length
      ]!;
    onSelect(next.view);
    document.getElementById(`agenda-tab-${next.view}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Escala de la agenda"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {AGENDA_TABS.map((tab, index) => {
        const active = tab.view === view;
        return (
          <button
            key={tab.view}
            id={`agenda-tab-${tab.view}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`agenda-panel-${tab.view}`}
            tabIndex={active ? 0 : -1}
            title={tab.question}
            onClick={() => onSelect(tab.view)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={[
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm transition-colors',
              active
                ? 'border-fg font-medium text-fg'
                : 'border-transparent text-muted hover:text-fg',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div role="status" aria-label="Cargando tu agenda" className="space-y-3">
      <div className="h-5 w-2/3 max-w-md rounded bg-elevated" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-14 rounded-lg border border-line bg-surface" />
      ))}
      <span className="sr-only">Cargando tu agenda…</span>
    </div>
  );
}

/** El contenido de una vista ya cargada (testeable sin red). */
export function AgendaBody({
  agenda,
  workspaceId,
  base,
  onAsk,
  onNavigate,
  onMore,
}: {
  agenda: AgendaView;
  workspaceId: string;
  base: string;
  onAsk: AskPixel;
  onNavigate: (anchor: string) => void;
  onMore: () => void;
}) {
  const empty = !agenda.items.length && !agenda.pendingItems.length;
  const views: Record<AgendaViewKind, ReactNode> = {
    today: <TodayView agenda={agenda} base={base} onAsk={onAsk} />,
    week: <WeekView agenda={agenda} base={base} onAsk={onAsk} />,
    month: <MonthView key={agenda.anchor} agenda={agenda} base={base} onAsk={onAsk} />,
    upcoming: <UpcomingView agenda={agenda} onAsk={onAsk} onMore={onMore} />,
  };
  const { previous, next, today } = agenda.navigation;
  const isCurrent =
    agenda.view === 'upcoming' || agenda.days.some((day) => day.isToday && day.inRange);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
          {agenda.title}
        </h2>
        {previous && next && (
          <nav aria-label="Cambiar de periodo" className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Periodo anterior"
              onClick={() => onNavigate(previous)}
              className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong hover:text-fg"
            >
              <Icon name="arrowLeft" className="size-4" />
            </button>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => onNavigate(today)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-line-strong hover:text-fg"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              aria-label="Periodo siguiente"
              onClick={() => onNavigate(next)}
              className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong hover:text-fg"
            >
              <Icon name="arrowRight" className="size-4" />
            </button>
          </nav>
        )}
      </div>

      <p className="max-w-3xl text-[15px] leading-relaxed text-muted">{agenda.summary}</p>

      {agenda.connection.message && (
        <Alert>
          <div className="space-y-3">
            <p>{agenda.connection.message}</p>
            <CalendarConnectButton
              workspaceId={workspaceId}
              status={agenda.connection.status}
              returnTo="agenda"
            />
          </div>
        </Alert>
      )}

      <AgendaLegend />

      {empty ? (
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <p className="font-display text-lg font-bold">Todavía no hay mucho por mostrar.</p>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Pídele a Pixel que organice tu semana con tu disponibilidad real.
          </p>
          <Button className="mt-5" onClick={() => onAsk('Organízame la semana: ')}>
            Organizar mi semana
          </Button>
        </div>
      ) : (
        views[agenda.view]
      )}
    </>
  );
}
