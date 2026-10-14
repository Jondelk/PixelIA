import type { AvatarPreview } from '@pixel/contracts';

/*
 * WorkspaceAccentResolver (Prompt 17): PIXELES mantiene su sistema visual; cada Pixel solo añade un
 * acento sutil (anillo de presencia, punto del workspace, tarjeta seleccionada). El color es un DATO
 * del personaje (derivado del ADN), por eso se aplica como estilo en línea y no como token.
 * Si el color no se lee sobre el fondo oscuro, se aclara; si aun así no llega, acento del sistema.
 */

/** Fondo de la interfaz (Negro Cine): el acento se valida contra él. */
const CANVAS = '#08080B';
/** Contraste mínimo para elementos gráficos (WCAG 1.4.11). */
export const ACCENT_MIN_CONTRAST = 3;

const channel = (hex: string, index: number) =>
  parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const c = channel(hex, i) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mezcla con blanco (0–1). */
function lighten(hex: string, amount: number): string {
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(hex, i) + (255 - channel(hex, i)) * amount),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export interface WorkspaceAccent {
  /** null = acento del sistema (token `fg`/`line-strong`). */
  color: string | null;
  source: 'avatar' | 'system';
}

export const SYSTEM_ACCENT: WorkspaceAccent = { color: null, source: 'system' };

/** Acento seguro del personaje: su color de acento o, si no se lee, el principal. */
export function resolveAccent(avatar: Pick<AvatarPreview, 'accentColor' | 'primaryColor'> | null) {
  if (!avatar) return SYSTEM_ACCENT;
  for (const candidate of [avatar.accentColor.hex, avatar.primaryColor.hex]) {
    if (!/^#[0-9a-f]{6}$/i.test(candidate)) continue;
    for (let step = 0; step <= 6; step += 1) {
      const color = step ? lighten(candidate, step * 0.12) : candidate;
      if (contrastRatio(color, CANVAS) >= ACCENT_MIN_CONTRAST) {
        return { color: color.toLowerCase(), source: 'avatar' } satisfies WorkspaceAccent;
      }
    }
  }
  return SYSTEM_ACCENT;
}
