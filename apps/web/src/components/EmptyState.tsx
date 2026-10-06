import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Estado vacío honesto: explica qué vivirá aquí y en qué etapa del backlog llega. */
export function EmptyState({
  icon,
  title,
  description,
  stage,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  stage?: string;
  action?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface/80 px-6 py-14 text-center sm:px-10 sm:py-20">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        aria-hidden="true"
      />
      <div className="mx-auto mb-6 grid size-14 place-items-center rounded-xl border border-line-strong bg-elevated shadow-[0_0_40px_-12px_var(--color-accent)]">
        <Icon name={icon} className="size-6 text-accent" />
      </div>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-8 flex justify-center">{action}</div>}
      {stage && (
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] text-subtle">
          <span className="size-1.5 rounded-full bg-subtle" aria-hidden="true" />
          {stage}
        </p>
      )}
    </section>
  );
}
