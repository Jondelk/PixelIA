import type { Vec3 } from './sdf.js';

/** Utilidades de color: hex sRGB ↔ lineal (el sombreado y glTF trabajan en lineal). */

export function hexToSrgb(hex: string): Vec3 {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) value = [...value].map((c) => c + c).join('');
  const n = Number.parseInt(value.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export function hexToLinear(hex: string): Vec3 {
  const [r, g, b] = hexToSrgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

export function mixLinear(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Luminancia relativa de un color lineal. */
export const luminanceLinear = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
