/** Utilidades de color en sRGB (hex) para derivar tonos del personaje. Funciones puras. */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

/** Mezcla `a` con `b`; t = 0 devuelve a, t = 1 devuelve b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((c, i) => c + (cb[i]! - c) * t) as Rgb);
}

export const darken = (hex: string, t: number) => mix(hex, '#000000', t);
export const lighten = (hex: string, t: number) => mix(hex, '#FFFFFF', t);

/** Luminancia relativa WCAG (0 negro – 1 blanco). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Distancia perceptual aproximada (0–~765) para saber si dos colores se confunden. */
export function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const rMean = (ca[0] + cb[0]) / 2;
  const [dr, dg, db] = [ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]];
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
