import { useCallback, useState } from 'react';

export interface FlashMessage {
  message: string;
  action?: { label: string; onClick: () => void };
}

/** Aviso de éxito de una pantalla (ver <Flash>). */
export function useFlash(initial?: string) {
  const [flash, setFlash] = useState<FlashMessage | null>(initial ? { message: initial } : null);
  const dismiss = useCallback(() => setFlash(null), []);
  const show = useCallback((next: FlashMessage | string) => {
    setFlash(typeof next === 'string' ? { message: next } : next);
  }, []);
  return { flash, show, dismiss };
}
