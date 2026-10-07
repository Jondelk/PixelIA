import type { Company } from '@pixel/contracts';

export type PixelTone = 'idle' | 'progress' | 'learned' | 'ready' | 'error';

/** Cómo se presenta el estado de una empresa (ADN y personaje). */
export function pixelStatus(company: Pick<Company, 'status' | 'brandDnaVersion'>): {
  label: string;
  tone: PixelTone;
} {
  switch (company.status) {
    case 'ready':
      return { label: 'Lista para crear', tone: 'ready' };
    case 'failed':
      return { label: 'El análisis necesita reintentarse', tone: 'error' };
    case 'analyzing':
      return { label: 'Pixel analizando la marca', tone: 'progress' };
    case 'draft':
    case 'onboarding':
      if (company.brandDnaVersion)
        return { label: 'ADN de marca listo · personaje pendiente', tone: 'learned' };
      if (company.status === 'onboarding')
        return { label: 'Onboarding de marca en curso', tone: 'progress' };
      return { label: 'Marca sin configurar', tone: 'idle' };
  }
}

export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return initials.toUpperCase();
}
