import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8 sm:mb-10">
      {eyebrow && (
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-accent/80">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}
