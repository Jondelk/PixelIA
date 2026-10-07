import type { CSSProperties } from 'react';

/** Retraso escalonado de la animación de aparición (animate-rise) del bloque n. */
export const rise = (step: number): CSSProperties => ({ animationDelay: `${80 + step * 55}ms` });
