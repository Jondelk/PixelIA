import type { PixelActionPlan } from '@pixel/contracts';
import type { ReactNode } from 'react';

/**
 * La propuesta de Pixel antes de crear nada: lo que entendió, lo que propone y lo que creará al
 * confirmar. En lenguaje humano (campaña, plan, piezas, tareas), nunca con nombres internos.
 * `actions` lleva Organizar · Ajustar · Cancelar (o el campo para ajustar).
 */
export function PixelProposalCard({
  plan,
  actions,
}: {
  plan: PixelActionPlan;
  actions: ReactNode;
}) {
  return (
    <section
      aria-label="Propuesta de Pixel"
      className="@container rounded-2xl border border-line-strong bg-surface p-6 sm:p-8"
    >
      <p className="max-w-2xl text-[15px] leading-relaxed text-fg">{plan.summary}</p>
      {/* Por su propio ancho, no el de la ventana: en el Pixel Dock (estrecho) va en una columna. */}
      <div className="mt-6 grid gap-6 @2xl:grid-cols-3">
        <ProposalList title="Lo que entendí" items={plan.understood} />
        <ProposalList title="Lo que propongo" items={plan.proposal} />
        <ProposalList title="Qué voy a crear" items={plan.creates} />
      </div>
      <div className="mt-7 border-t border-line pt-5">{actions}</div>
    </section>
  );
}

function ProposalList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2 break-words">
            <span className="mt-2 size-1 shrink-0 bg-line-strong" aria-hidden="true" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
