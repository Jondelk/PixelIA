import type { CompanyStatus } from '@pixel/contracts';

export type PixelTone = 'idle' | 'progress' | 'ready' | 'error';

/** Cómo se presenta el estado del Pixel de una empresa. */
export function pixelStatus(status: CompanyStatus): { label: string; tone: PixelTone } {
  switch (status) {
    case 'draft':
    case 'onboarding':
      return { label: 'Pixel aún no configurado', tone: 'idle' };
    case 'analyzing':
      return { label: 'Pixel analizando la marca', tone: 'progress' };
    case 'ready':
      return { label: 'Pixel listo', tone: 'ready' };
    case 'failed':
      return { label: 'El análisis necesita reintentarse', tone: 'error' };
  }
}

export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return initials.toUpperCase();
}
