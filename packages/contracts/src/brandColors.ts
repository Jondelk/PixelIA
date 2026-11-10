/*
 * Elección de colores de marca a partir de colores medidos (rellenos de un PDF, píxeles de un
 * logo). Función pura y determinista, compartida por la API y la web.
 *
 * - Agrupa colores casi iguales (antialiasing, compresión JPEG) y suma su peso.
 * - Descarta el blanco y los casi blancos (fondos).
 * - Prioriza los colores con saturación: son los que distinguen a una marca. Los neutros (negro,
 *   grises) solo entran si la marca casi no tiene colores, y como máximo uno.
 */

export interface ColorSample {
  hex: string;
  /** Peso relativo: veces que aparece, píxeles, área… */
  weight: number;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1]!;
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Saturación HSL (0–1) y luminosidad (0–1). */
function saturationLightness([r, g, b]: Rgb): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Distancia perceptual aproximada ("redmean"). */
function distance(a: Rgb, b: Rgb): number {
  const rMean = (a[0] + b[0]) / 2;
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

/** Colores que se consideran el mismo (≈ variaciones de antialiasing o compresión). */
const SAME_COLOR = 60;
/** Un color debe pesar al menos esta fracción de los colores con saturación. */
const MIN_SHARE = 0.02;

export function pickBrandColors(samples: ColorSample[], max = 5): string[] {
  const groups: { rgb: Rgb; weight: number }[] = [];
  for (const sample of samples) {
    const rgb = toRgb(sample.hex);
    if (!rgb || !(sample.weight > 0)) continue;
    if (Math.min(...rgb) > 235) continue; // blanco y casi blanco: fondo
    const group = groups.find((g) => distance(g.rgb, rgb) < SAME_COLOR);
    if (group) {
      // Media ponderada: el grupo converge al color más usado.
      const total = group.weight + sample.weight;
      group.rgb = group.rgb.map(
        (c, i) => (c * group.weight + rgb[i]! * sample.weight) / total,
      ) as Rgb;
      group.weight = total;
    } else {
      groups.push({ rgb, weight: sample.weight });
    }
  }

  const chromatic = groups.filter((g) => {
    const { s, l } = saturationLightness(g.rgb);
    return s >= 0.2 && l > 0.08 && l < 0.95;
  });
  const neutral = groups.filter((g) => !chromatic.includes(g));
  const chromaticWeight = chromatic.reduce((sum, g) => sum + g.weight, 0);

  const picked = chromatic
    .filter((g) => g.weight >= chromaticWeight * MIN_SHARE)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max);
  if (picked.length < 2 && neutral.length) {
    picked.push([...neutral].sort((a, b) => b.weight - a.weight)[0]!);
  }
  return picked.slice(0, max).map((g) => toHex(g.rgb));
}
