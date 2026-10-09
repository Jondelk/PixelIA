import type { ReactNode } from 'react';
import { Pixi } from './Pixi';

/** Estado vacío: Pixi, una frase clara y la acción que sigue. Mucho espacio, nada decorativo. */
export function EmptyState({
  title,
  description,
  stage,
  action,
}: {
  title: string;
  description: string;
  stage?: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-6 py-14 text-center sm:px-10 sm:py-20">
      <Pixi size={112} className="mx-auto mb-8" />
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-8 flex justify-center">{action}</div>}
      {stage && <p className="mt-6 text-xs uppercase tracking-[0.16em] text-subtle">{stage}</p>}
    </section>
  );
}
