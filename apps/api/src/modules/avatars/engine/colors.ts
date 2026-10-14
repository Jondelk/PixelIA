/** Utilidades de color para nombrar y derivar colores del avatar. */

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function hsl(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation, lightness };
}

/** Mezcla un color con blanco (amount > 0) o negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(hexToRgb(hex).map((c) => c + (target - c) * t) as [number, number, number]);
}

/** Familia de color en español: "marrón", "azul", "gris"… */
export function colorFamily(hex: string): string {
  const { hue, saturation, lightness } = hsl(hex);
  if (lightness < 0.12) return 'negro';
  if (lightness > 0.92) return 'blanco';
  if (saturation < 0.15) return lightness > 0.8 ? 'blanco roto' : 'gris';
  if (hue >= 15 && hue < 50 && lightness < 0.5 && (lightness < 0.35 || saturation < 0.6)) {
    return 'marrón';
  }
  if (hue < 15 || hue >= 345) return lightness > 0.7 ? 'rosa' : 'rojo';
  if (hue < 38) return lightness > 0.65 ? (saturation < 0.75 ? 'crema' : 'durazno') : 'naranja';
  if (hue < 65) return lightness > 0.65 ? 'crema' : lightness < 0.4 ? 'ocre' : 'amarillo';
  if (hue < 165) return 'verde';
  if (hue < 200) return 'cian';
  if (hue < 255) return 'azul';
  if (hue < 290) return 'violeta';
  return 'magenta';
}

/** Nombre descriptivo: "Tostado (marrón café)" o "azul oscuro". */
export function describeColor(
  hex: string,
  brandName: string | null,
  qualifiers: Record<string, string> = {},
): string {
  const family = colorFamily(hex);
  const { lightness } = hsl(hex);
  const qualifier = qualifiers[family];
  const tone =
    qualifier ??
    (['negro', 'blanco', 'blanco roto', 'crema'].includes(family)
      ? ''
      : lightness < 0.3
        ? 'oscuro'
        : lightness > 0.72
          ? 'claro'
          : '');
  const description = [family, tone].filter(Boolean).join(' ');
  if (!brandName) return description;
  // "Cian (cian)" o "Amarillo seguridad (amarillo)" → solo el nombre de la marca.
  return brandName.toLocaleLowerCase('es').includes(family)
    ? brandName
    : `${brandName} (${description})`;
}
