import type { ReactNode } from 'react';

/** Aviso de error: texto claro y el píxel señal (sin colores de alarma fuera de la paleta). */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-sm text-fg"
    >
      <span className="mt-1.5 size-2 shrink-0 bg-alert" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
