import { pickBrandColors, type ColorSample } from '@pixel/contracts';

/*
 * Colores dominantes de una imagen (logo, pieza gráfica), calculados en el navegador con canvas:
 * sin IA, sin enviar nada a terceros y sin librerías. La API los usa como colores de marca.
 */

/** Lado máximo al que se reduce la imagen antes de contar colores. */
const SAMPLE_SIZE = 96;

/**
 * Agrupa los píxeles en 32 niveles por canal y devuelve el color medio de cada grupo con su
 * número de píxeles. Ignora los transparentes (fondos de PNG).
 */
export function samplePixels(data: Uint8ClampedArray | number[]): ColorSample[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return [...buckets.values()].map(({ r, g, b, n }) => ({
    hex: `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`.toUpperCase(),
    weight: n,
  }));
}

export function isImageFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

/** Colores de marca de una imagen; [] si el navegador no puede decodificarla. */
export async function imageBrandColors(file: File): Promise<string[]> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return pickBrandColors(samplePixels(context.getImageData(0, 0, width, height).data));
  } catch {
    return [];
  }
}
