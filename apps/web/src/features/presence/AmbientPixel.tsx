import type { ReactNode } from 'react';
import { PixelPresenceAvatar } from './PixelPresenceAvatar';
import { usePixelPresence } from './presenceContext';

/**
 * Presencia AMBIENT junto a una entrada de Pixel (Campañas, Plan de contenido): el Pixel pequeño y
 * en 2D (ningún WebGL extra), al lado de la pregunta. El estado lo comparte con todo el workspace.
 */
export function WithAmbientPixel({ children }: { children: ReactNode }) {
  const { scope } = usePixelPresence();
  return (
    <div className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
      <PixelPresenceAvatar
        avatar={scope?.avatar ?? null}
        level="ambient"
        className="max-sm:hidden"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Estado vacío con el Pixel del workspace en reposo (en lugar de una ilustración suelta). */
export function PresenceFigure() {
  const { scope } = usePixelPresence();
  return (
    <PixelPresenceAvatar
      avatar={scope?.avatar ?? null}
      level="ambient"
      state="idle"
      className="mx-auto !size-24"
    />
  );
}
