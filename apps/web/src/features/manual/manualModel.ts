import { BRAND_ARCHETYPES, type BrandArchetype, type BrandDna } from '@pixel/contracts';

/*
 * Datos derivados del manual de marca. Funciones puras: el manual se calcula a partir del
 * BrandDNA (y del personaje), sin guardar nada. Si el ADN cambia, el manual cambia con él.
 */

// ---------------------------------------------------------------- color

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

/** CMYK aproximado (sin perfil ICC): orientativo para imprenta, se confirma con prueba de color. */
export function rgbToCmyk([r, g, b]: Rgb): [number, number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number];
}

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

export type ContrastGrade = 'AAA' | 'AA' | 'AA grande' | 'No apto';

/** Nivel WCAG 2.x del texto sobre un fondo. */
export function contrastGrade(ratio: number): ContrastGrade {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA grande';
  return 'No apto';
}

export const INK = '#08080B';
export const PAPER = '#FFFFFF';

/** Color de texto legible sobre `background` (tinta o papel, el de mayor contraste). */
export function readableOn(background: string): string {
  return contrastRatio(background, INK) >= contrastRatio(background, PAPER) ? INK : PAPER;
}

type Palette = BrandDna['visualLanguage']['palette'];
type PaletteRole = Palette[number]['role'];

const ROLE_WEIGHT: Record<PaletteRole, number> = {
  primary: 50,
  secondary: 25,
  accent: 10,
  neutral: 10,
  support: 5,
};

export const ROLE_USAGE: Record<PaletteRole, string> = {
  primary: 'Color de reconocimiento: fondos de marca, piezas principales y el personaje.',
  secondary: 'Acompaña al principal: bloques de apoyo, ilustraciones y fondos alternos.',
  accent: 'Puntual: llamados a la acción y detalles que deben destacar. Úsalo con medida.',
  neutral: 'Base de lectura: fondos, textos y espacios de respiro.',
  support: 'Complemento ocasional para gráficos o variaciones.',
};

export interface SwatchInfo {
  hex: string;
  name: string;
  role: PaletteRole;
  rgb: string;
  cmyk: string;
  /** Proporción de uso sugerida (porcentaje, suma 100). */
  share: number;
  textColor: string;
  onPaper: { ratio: number; grade: ContrastGrade };
  onInk: { ratio: number; grade: ContrastGrade };
}

export function paletteSwatches(palette: Palette, roleLabel: Record<PaletteRole, string>) {
  const total = palette.reduce((sum, color) => sum + ROLE_WEIGHT[color.role], 0) || 1;
  return palette.map((color, index): SwatchInfo => {
    const hex = color.hex.toUpperCase();
    const rgb = hexToRgb(hex);
    const toPaper = contrastRatio(hex, PAPER);
    const toInk = contrastRatio(hex, INK);
    return {
      hex,
      name: color.name ?? `${roleLabel[color.role]} ${index + 1}`,
      role: color.role,
      rgb: rgb.join(' · '),
      cmyk: rgbToCmyk(rgb).join(' · '),
      share: Math.round((ROLE_WEIGHT[color.role] / total) * 100),
      textColor: readableOn(hex),
      onPaper: { ratio: toPaper, grade: contrastGrade(toPaper) },
      onInk: { ratio: toInk, grade: contrastGrade(toInk) },
    };
  });
}

/** Colores clave del manual (portada, acentos) a partir de la paleta. */
export function manualColors(palette: Palette) {
  const byRole = (role: PaletteRole) => palette.find((color) => color.role === role)?.hex;
  const primary = (byRole('primary') ?? palette[0]?.hex ?? INK).toUpperCase();
  const secondary = (byRole('secondary') ?? palette[1]?.hex ?? primary).toUpperCase();
  const accent = (byRole('accent') ?? palette[2]?.hex ?? secondary).toUpperCase();
  const neutral = (byRole('neutral') ?? '#F2F0EC').toUpperCase();
  return {
    primary,
    secondary,
    accent,
    neutral,
    onPrimary: readableOn(primary),
    onSecondary: readableOn(secondary),
    onAccent: readableOn(accent),
    onNeutral: readableOn(neutral),
  };
}

// ---------------------------------------------------------------- tipografía

export interface TypePairing {
  id: string;
  display: { family: string; weight: number };
  text: { family: string; weight: number };
  /** Carácter que transmite la combinación. */
  mood: string;
}

/** Combinaciones de Google Fonts (licencia abierta, uso comercial libre). */
export const TYPE_PAIRINGS: TypePairing[] = [
  {
    id: 'humanist',
    display: { family: 'Fraunces', weight: 600 },
    text: { family: 'Nunito Sans', weight: 400 },
    mood: 'cálida, artesanal y cercana',
  },
  {
    id: 'geometric',
    display: { family: 'Space Grotesk', weight: 600 },
    text: { family: 'Inter', weight: 400 },
    mood: 'precisa, contemporánea y tecnológica',
  },
  {
    id: 'elegant',
    display: { family: 'Playfair Display', weight: 600 },
    text: { family: 'Lato', weight: 400 },
    mood: 'elegante, refinada y sofisticada',
  },
  {
    id: 'playful',
    display: { family: 'Baloo 2', weight: 700 },
    text: { family: 'Nunito', weight: 400 },
    mood: 'amable, alegre y lúdica',
  },
  {
    id: 'structural',
    display: { family: 'Archivo', weight: 800 },
    text: { family: 'Archivo', weight: 400 },
    mood: 'sólida, firme y confiable',
  },
  {
    id: 'expert',
    display: { family: 'Sora', weight: 600 },
    text: { family: 'IBM Plex Sans', weight: 400 },
    mood: 'clara, experta y serena',
  },
];

const ARCHETYPE_BONUS: Record<string, BrandArchetype[]> = {
  humanist: ['creator', 'caregiver', 'everyman', 'explorer'],
  geometric: ['magician', 'rebel', 'explorer'],
  elegant: ['lover', 'ruler'],
  playful: ['jester', 'innocent'],
  structural: ['ruler', 'hero'],
  expert: ['sage'],
};

const SHAPE_BONUS: Record<string, BrandDna['visualLanguage']['shapeLanguage'][]> = {
  humanist: ['organic', 'soft'],
  geometric: ['geometric'],
  elegant: ['fluid'],
  playful: ['soft'],
  structural: ['structural'],
  expert: ['geometric', 'mixed'],
};

export interface TypographyChoice {
  pairing: TypePairing;
  /** Razones legibles de la elección (rasgos del ADN). */
  reasons: string[];
}

/** Elige la combinación tipográfica que mejor expresa la personalidad del ADN (determinista). */
export function chooseTypography(dna: BrandDna): TypographyChoice {
  const d = dna.personality.dimensions;
  const shape = dna.visualLanguage.shapeLanguage;
  const primary = dna.archetypes.primary.id;
  const scores: Record<string, number> = {
    humanist: d.warmth * 0.5 + (100 - d.innovation) * 0.4,
    geometric: d.innovation * 0.6 + (100 - d.warmth) * 0.2,
    elegant: d.sophistication * 0.7 + (100 - d.playfulness) * 0.2,
    playful: d.playfulness * 0.7 + d.warmth * 0.2,
    structural: (100 - d.playfulness) * 0.3 + (100 - d.innovation) * 0.2 + d.energy * 0.1,
    expert: (100 - d.playfulness) * 0.3 + d.sophistication * 0.3 + d.innovation * 0.2,
  };
  for (const id of Object.keys(scores)) {
    if (SHAPE_BONUS[id]?.includes(shape)) scores[id]! += 25;
    if (ARCHETYPE_BONUS[id]?.includes(primary)) scores[id]! += 18;
  }
  const best = TYPE_PAIRINGS.reduce((winner, pairing) =>
    scores[pairing.id]! > scores[winner.id]! ? pairing : winner,
  );

  const reasons: string[] = [];
  const dims: [keyof typeof d, string, string][] = [
    ['warmth', 'cercana', 'distante'],
    ['innovation', 'innovadora', 'tradicional'],
    ['sophistication', 'sofisticada', 'accesible'],
    ['playfulness', 'lúdica', 'seria'],
  ];
  const strongest = [...dims].sort((a, b) => Math.abs(d[b[0]] - 50) - Math.abs(d[a[0]] - 50))[0]!;
  const value = d[strongest[0]];
  reasons.push(`Personalidad ${value >= 50 ? strongest[1] : strongest[2]} (${value}/100)`);
  if (SHAPE_BONUS[best.id]?.includes(shape)) reasons.push(`lenguaje de formas ${shapeName(shape)}`);
  if (ARCHETYPE_BONUS[best.id]?.includes(primary)) {
    reasons.push(`arquetipo ${BRAND_ARCHETYPES[primary].name}`);
  }
  return { pairing: best, reasons };
}

function shapeName(shape: BrandDna['visualLanguage']['shapeLanguage']): string {
  return {
    organic: 'orgánico',
    geometric: 'geométrico',
    structural: 'estructural',
    fluid: 'fluido',
    soft: 'suave',
    mixed: 'mixto',
  }[shape];
}

/** URL de Google Fonts para cargar la combinación elegida. */
export function googleFontsUrl(pairing: TypePairing): string {
  const families = [pairing.display, pairing.text]
    .filter((font, i, all) => all.findIndex((f) => f.family === font.family) === i)
    .map((font) => {
      const weights = font === pairing.text ? [400, 600, 700] : [400, font.weight, 700];
      const unique = [...new Set(weights)].sort((a, b) => a - b).join(';');
      return `family=${font.family.replace(/ /g, '+')}:wght@${unique}`;
    });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

export const TYPE_SCALE = [
  { label: 'Titular', size: 44, lineHeight: 1.05, role: 'display' as const },
  { label: 'Subtítulo', size: 28, lineHeight: 1.15, role: 'display' as const },
  { label: 'Destacado', size: 19, lineHeight: 1.35, role: 'text-strong' as const },
  { label: 'Cuerpo', size: 14, lineHeight: 1.6, role: 'text' as const },
  { label: 'Nota', size: 10.5, lineHeight: 1.5, role: 'text' as const },
];

// ---------------------------------------------------------------- índice

export const MANUAL_SECTIONS = [
  { id: 'esencia', title: 'Esencia' },
  { id: 'proposito', title: 'Propósito y valores' },
  { id: 'audiencia', title: 'Audiencia' },
  { id: 'personalidad', title: 'Personalidad' },
  { id: 'voz', title: 'Voz y tono' },
  { id: 'color', title: 'Color' },
  { id: 'tipografia', title: 'Tipografía' },
  { id: 'lenguaje-visual', title: 'Lenguaje visual' },
  { id: 'personaje', title: 'El personaje' },
  { id: 'construccion', title: 'Construcción del personaje' },
  { id: 'usos', title: 'Usos del personaje' },
  { id: 'aplicaciones', title: 'Aplicaciones' },
  { id: 'limites', title: 'Lo que la marca no hace' },
] as const;

export function sectionNumber(id: (typeof MANUAL_SECTIONS)[number]['id']): string {
  return String(MANUAL_SECTIONS.findIndex((section) => section.id === id) + 1).padStart(2, '0');
}

/** Iniciales para el monograma provisional ("Café Tinto" → "CT"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? words.slice(0, 2) : [words[0] ?? '']).map((w) => w[0] ?? '');
  return letters.join('').toLocaleUpperCase('es') || '·';
}
