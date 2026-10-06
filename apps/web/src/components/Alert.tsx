import type { ReactNode } from 'react';

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3.5 py-2.5 text-sm text-rose-200"
    >
      {children}
    </div>
  );
}
