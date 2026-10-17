import type { AgendaView } from '@pixel/contracts';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { useResource } from '../../lib/useResource';
import { getAgenda } from './agendaApi';
import { AGENDA_MARKS } from './agendaLogic';

/**
 * «Próximos hoy» dentro de «Tu día» (Inicio Personal, Prompt 20): lo que queda del día y un enlace a
 * «Mi agenda». No convierte el Inicio en una agenda: como mucho 4 elementos y solo si hay datos.
 */
export function AgendaTodayPreview({ workspaceId, base }: { workspaceId: string; base: string }) {
  const { state } = useResource(`agenda:${workspaceId}:today:preview`, (signal) =>
    getAgenda(workspaceId, { view: 'today' }, signal),
  );
  if (state.status !== 'success') return null;
  return <AgendaTodayPreviewView agenda={state.data} base={base} />;
}

export function AgendaTodayPreviewView({ agenda, base }: { agenda: AgendaView; base: string }) {
  const next = agenda.items
    .filter(
      (item) =>
        !item.allDay && !item.deadline && (item.status === 'upcoming' || item.status === 'now'),
    )
    .slice(0, 4);
  const pending = agenda.pendingItems.length;
  if (!next.length && !pending) return null;
  return (
    <section
      aria-label="Próximos hoy"
      className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
        Próximos hoy
      </h2>
      {next.length > 0 && (
        <ul className="mt-3 space-y-2">
          {next.map((item) => (
            <li key={item.id} className="flex items-baseline gap-3 text-sm">
              <span className="w-12 shrink-0 tabular-nums text-muted">
                {item.timeLabel?.slice(0, 5)}
              </span>
              <span
                aria-hidden="true"
                className={item.kind === 'pixel_block' ? 'text-fg' : 'text-subtle'}
              >
                {AGENDA_MARKS[item.kind]}
              </span>
              <span className="min-w-0 truncate text-fg">{item.title}</span>
              <span className="sr-only">, {item.kindLabel}</span>
            </li>
          ))}
        </ul>
      )}
      {pending > 0 && (
        <p className="mt-3 text-sm text-muted">
          {pending === 1 ? '1 pendiente por organizar' : `${pending} pendientes por organizar`}.
        </p>
      )}
      <Link
        to={`${base}/agenda?view=today`}
        className="mt-4 inline-flex items-center gap-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        Ver agenda completa <Icon name="arrowRight" className="size-3.5" />
      </Link>
    </section>
  );
}
