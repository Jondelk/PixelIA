import { useApiHealth } from './useApiHealth';

const VIEW = {
  checking: { label: 'Conectando…', dot: 'bg-subtle', text: 'text-subtle' },
  online: {
    label: 'API en línea',
    dot: 'bg-accent shadow-[0_0_8px_var(--color-accent)]',
    text: 'text-muted',
  },
  degraded: { label: 'Base de datos desconectada', dot: 'bg-amber-400', text: 'text-amber-200/80' },
  offline: { label: 'API sin conexión', dot: 'bg-rose-500', text: 'text-rose-200/80' },
} as const;

/** Indicador real del estado de la API (GET /api/health). */
export function ApiStatus() {
  const state = useApiHealth();
  const view = VIEW[state.status];
  const detail =
    'health' in state
      ? `${state.health.service} v${state.health.version} · DB: ${state.health.database}`
      : undefined;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5"
      title={detail}
      role="status"
    >
      <span className={`size-1.5 rounded-full ${view.dot}`} aria-hidden="true" />
      <span className={`text-xs ${view.text}`}>
        <span className="sm:hidden">API</span>
        <span className="hidden sm:inline">{view.label}</span>
      </span>
    </div>
  );
}
