import { PRIORITY_LABELS, type Priority } from '@pixel/contracts';
import { useEffect, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { formatDay, isPastDay } from './dates';

/*
 * Primitivas visuales de Operations. Sobrias: la tipografía y el espacio jerarquizan; el azul
 * solo rellena formas (selección, progreso) y el aviso usa `bg-alert` (nunca colores sueltos).
 */

/** Pestañas / filtros segmentados. La opción activa se rellena, no se colorea el texto. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={[
              'inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm transition-colors',
              active
                ? 'border-line-strong bg-elevated font-medium text-fg'
                : 'border-transparent text-muted hover:text-fg',
            ].join(' ')}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="text-xs tabular-nums text-subtle">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Prioridad: tres barras (rellenas según el nivel) y su etiqueta. */
export function PriorityMark({
  priority,
  compact = false,
}: {
  priority: Priority;
  compact?: boolean;
}) {
  const level = { low: 1, medium: 2, high: 3 }[priority];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      title={`Prioridad ${PRIORITY_LABELS[priority].toLowerCase()}`}
    >
      <span className="flex items-end gap-px" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`w-[3px] ${bar <= level ? 'bg-fg' : 'bg-line-strong'}`}
            style={{ height: `${4 + bar * 3}px` }}
          />
        ))}
      </span>
      <span className={compact ? 'sr-only' : ''}>{PRIORITY_LABELS[priority]}</span>
    </span>
  );
}

/** Estado en texto pequeño con borde (sin colores por estado). */
export function StatusTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

/** Fecha relativa ("Hoy", "Mañana", "15 oct"); si ya pasó y está pendiente, se marca. */
export function DueLabel({
  iso,
  pending = true,
  prefix,
}: {
  iso: string | null;
  pending?: boolean;
  prefix?: string;
}) {
  if (!iso) return null;
  const overdue = pending && isPastDay(iso);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted">
      {overdue && <span className="size-1.5 bg-alert" aria-hidden="true" />}
      {prefix && <span className="text-subtle">{prefix}</span>}
      <time dateTime={iso} className={overdue ? 'text-fg' : ''}>
        {formatDay(iso)}
      </time>
      {overdue && <span className="sr-only">(vencida)</span>}
    </span>
  );
}

/** Progreso 0–100 calculado por la API. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{value}%</span>
      </div>
      <div
        className="mt-2 h-1 w-full bg-elevated"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
      >
        <div
          className="h-full bg-brand transition-[width] duration-500 ease-pxl"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
      <Spinner className="size-5 text-fg" /> {label}
    </div>
  );
}

/** Aviso breve de éxito (role=status), con acción opcional ("Deshacer"). Se oculta solo. */
export function Flash({
  message,
  action,
  onDismiss,
}: {
  message: string | null;
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div aria-live="polite" role="status" className="min-h-0">
      {message && (
        <div className="mb-6 flex animate-rise items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-fg">
          <span className="size-1.5 bg-fg" aria-hidden="true" />
          <span className="flex-1">{message}</span>
          {action && (
            <Button variant="ghost" className="!px-2 !py-1" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Bloque de sección con título y acción a la derecha. */
export function SectionHeading({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-2.5 font-display text-base font-bold">
        {title}
        {count !== undefined && (
          <span className="font-sans text-sm font-normal tabular-nums text-subtle">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Estado vacío compacto dentro de una sección (sin Pixi: el EmptyState grande es para páginas). */
export function InlineEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong px-6 py-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}
