import { PresenceDot } from './PixelPresenceAvatar';
import { usePixelPresence } from './presenceContext';

/**
 * Estado de Pixel en la topbar, solo dentro de un Pixel configurado: «Pixel listo», «Escuchando…»,
 * «Pensando…». Mínimo: un punto y una palabra (el avatar ya comunica el resto).
 */
export function PresenceStatus() {
  const { scope, state, label } = usePixelPresence();
  if (!scope?.configured) return null;
  return (
    <div
      className="flex items-center gap-2 px-1 text-xs text-muted"
      role="status"
      aria-live="polite"
    >
      <PresenceDot state={state} />
      <span className="max-sm:sr-only">{label}</span>
    </div>
  );
}
