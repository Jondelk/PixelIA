import type { ReactNode } from 'react';
import { rise } from './rise';
import { Icon } from './Icon';

/*
 * Piezas para presentar un ADN (de marca o personal) como lo que Pixel aprendió: secciones,
 * chips, etiquetas, medidores y listas. Las comparten "Así entiende Pixel tu marca" y
 * "Así te entiende Pixel".
 */

export function Section({
  title,
  eyebrow,
  step,
  className = '',
  children,
}: {
  title: string;
  eyebrow: string;
  step: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`animate-rise rounded-2xl border border-line bg-surface p-6 sm:p-8 ${className}`}
      style={rise(step)}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
      <h2 className="mt-2 font-display text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Chips({
  items,
  tone = 'default',
}: {
  items: string[];
  tone?: 'default' | 'strong' | 'muted';
}) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  const styles = {
    default: 'border-line-strong text-fg',
    strong: 'border-line-strong bg-elevated font-medium text-fg',
    muted: 'border-line text-muted',
  }[tone];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-md border px-3 py-1 text-[13px] ${styles}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
      {children}
    </p>
  );
}

export function Meter({ level, label }: { level: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`h-1.5 w-5 ${n <= level ? 'bg-fg' : 'bg-elevated'}`} />
        ))}
      </div>
      <span className="text-sm text-fg">{label}</span>
    </div>
  );
}

export function BulletList({ items, icon }: { items: string[]; icon?: 'check' | 'x' }) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-fg">
          {icon ? (
            <Icon
              name={icon}
              className={`mt-0.5 size-4 shrink-0 ${icon === 'check' ? 'text-fg' : 'text-subtle'}`}
            />
          ) : (
            <span className="mt-2 size-1 shrink-0 bg-subtle" aria-hidden="true" />
          )}
          {item}
        </li>
      ))}
    </ul>
  );
}
