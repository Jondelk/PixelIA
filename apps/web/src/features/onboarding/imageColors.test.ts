import { pickBrandColors } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { isImageFile, samplePixels } from './imageColors';

/** Píxeles RGBA: n píxeles de cada color. */
function pixels(...parts: [r: number, g: number, b: number, a: number, n: number][]): number[] {
  return parts.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat());
}

describe('Colores de una imagen', () => {
  it('logo café sobre fondo blanco: toma el marrón y el crema, ignora el fondo', () => {
    const data = pixels(
      [255, 255, 255, 255, 600], // fondo
      [107, 62, 38, 255, 250], // marrón de marca
      [109, 64, 40, 255, 40], // antialiasing
      [232, 192, 125, 255, 90], // crema
      [0, 0, 0, 0, 300], // transparente
    );
    expect(pickBrandColors(samplePixels(data))).toEqual(['#6B3E26', '#E8C07D']);
  });

  it('logo negro: entra el negro porque no hay otros colores', () => {
    const data = pixels([255, 255, 255, 255, 500], [10, 10, 12, 255, 200]);
    expect(pickBrandColors(samplePixels(data))).toEqual(['#0A0A0C']);
  });

  it('con colores de marca, los grises de texto no entran', () => {
    const data = pixels(
      [43, 43, 43, 255, 900], // texto gris oscuro
      [30, 20, 255, 255, 120], // azul
      [242, 229, 0, 255, 60], // amarillo
    );
    expect(pickBrandColors(samplePixels(data))).toEqual(['#1E14FF', '#F2E500']);
  });

  it('ignora colores casi ausentes (ruido)', () => {
    const data = pixels([200, 30, 40, 255, 1000], [20, 160, 60, 255, 5]);
    expect(pickBrandColors(samplePixels(data))).toEqual(['#C81E28']);
  });

  it('reconoce imágenes por tipo o extensión', () => {
    expect(isImageFile({ name: 'logo.PNG', type: '' })).toBe(true);
    expect(isImageFile({ name: 'x', type: 'image/webp' })).toBe(true);
    expect(isImageFile({ name: 'brochure.pdf', type: 'application/pdf' })).toBe(false);
  });
});
