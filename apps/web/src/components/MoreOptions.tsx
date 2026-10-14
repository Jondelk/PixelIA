import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * «Más opciones»: las rutas manuales (brief detallado, crear a mano…) siguen a un clic, pero con
 * menos peso que la entrada de Pixel. Con <details>: accesible por teclado y sin estado propio.
 */
export function MoreOptions({
  children,
  label = 'Más opciones',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-fg [&::-webkit-details-marker]:hidden">
        {label}
        <Icon name="chevron" className="size-3.5 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 flex flex-wrap gap-3">{children}</div>
    </details>
  );
}
