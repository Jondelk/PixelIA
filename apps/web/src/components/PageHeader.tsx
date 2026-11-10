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
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
      )}
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
        {title}
      </h1>
      {description && (
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}
