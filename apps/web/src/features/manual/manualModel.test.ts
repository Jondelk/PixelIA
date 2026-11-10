import type { BrandDna } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import {
  chooseTypography,
  contrastGrade,
  contrastRatio,
  googleFontsUrl,
  hexToRgb,
  initials,
  manualColors,
  MANUAL_SECTIONS,
  paletteSwatches,
  readableOn,
  rgbToCmyk,
  sectionNumber,
  TYPE_PAIRINGS,
} from './manualModel';

const roles = {
  primary: 'Principal',
  secondary: 'Secundario',
  accent: 'Acento',
  neutral: 'Neutro',
  support: 'Apoyo',
};

type Palette = BrandDna['visualLanguage']['palette'];
const palette: Palette = [
  { hex: '#6B3E26', name: 'Tostado', role: 'primary', temperature: 'warm', luminance: 0.07 },
  { hex: '#E8D9C0', name: null, role: 'secondary', temperature: 'warm', luminance: 0.7 },
  { hex: '#C8102E', name: 'Rojo café', role: 'accent', temperature: 'warm', luminance: 0.12 },
];

function dnaWith(
  dimensions: BrandDna['personality']['dimensions'],
  shapeLanguage: BrandDna['visualLanguage']['shapeLanguage'],
  archetype: BrandDna['archetypes']['primary']['id'],
): BrandDna {
  return {
    personality: { traits: [], dimensions },
    visualLanguage: { palette, shapeLanguage },
    archetypes: {
      primary: { id: archetype, score: 100, signals: [] },
      secondary: null,
      ranking: [],
    },
  } as unknown as BrandDna;
}

describe('Color del manual', () => {
  it('convierte a RGB y CMYK', () => {
    expect(hexToRgb('#6B3E26')).toEqual([107, 62, 38]);
    expect(rgbToCmyk([0, 0, 0])).toEqual([0, 0, 0, 100]);
    expect(rgbToCmyk([255, 255, 255])).toEqual([0, 0, 0, 0]);
    expect(rgbToCmyk([255, 0, 0])).toEqual([0, 100, 100, 0]);
  });

  it('califica el contraste según WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastGrade(7.2)).toBe('AAA');
    expect(contrastGrade(4.6)).toBe('AA');
    expect(contrastGrade(3.2)).toBe('AA grande');
    expect(contrastGrade(2)).toBe('No apto');
  });

  it('elige tinta o papel según el fondo', () => {
    expect(readableOn('#6B3E26')).toBe('#FFFFFF');
    expect(readableOn('#F2E500')).toBe('#08080B');
  });

  it('fichas de color con proporción de uso que suma 100', () => {
    const swatches = paletteSwatches(palette, roles);
    expect(swatches.map((s) => s.name)).toEqual(['Tostado', 'Secundario 2', 'Rojo café']);
    expect(swatches[0]).toMatchObject({ rgb: '107 · 62 · 38', textColor: '#FFFFFF' });
    const total = swatches.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
    expect(swatches[0]!.share).toBeGreaterThan(swatches[1]!.share);
  });

  it('colores clave con respaldo si falta un rol', () => {
    const colors = manualColors([palette[0]!]);
    expect(colors.primary).toBe('#6B3E26');
    expect(colors.secondary).toBe('#6B3E26');
    expect(colors.onPrimary).toBe('#FFFFFF');
  });
});

describe('Tipografía', () => {
  it('marca cálida, tradicional y orgánica → humanista', () => {
    const choice = chooseTypography(
      dnaWith(
        { innovation: 30, sophistication: 45, warmth: 85, playfulness: 45, energy: 50 },
        'organic',
        'creator',
      ),
    );
    expect(choice.pairing.id).toBe('humanist');
    expect(choice.reasons[0]).toContain('cercana');
  });

  it('marca innovadora y geométrica → geométrica', () => {
    const choice = chooseTypography(
      dnaWith(
        { innovation: 90, sophistication: 60, warmth: 35, playfulness: 30, energy: 70 },
        'geometric',
        'magician',
      ),
    );
    expect(choice.pairing.id).toBe('geometric');
  });

  it('marca estructural y gobernante → estructural', () => {
    const choice = chooseTypography(
      dnaWith(
        { innovation: 35, sophistication: 50, warmth: 45, playfulness: 20, energy: 55 },
        'structural',
        'ruler',
      ),
    );
    expect(choice.pairing.id).toBe('structural');
  });

  it('URL de Google Fonts sin familias repetidas', () => {
    const structural = TYPE_PAIRINGS.find((p) => p.id === 'structural')!;
    expect(googleFontsUrl(structural)).toBe(
      'https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&display=swap',
    );
    const geometric = TYPE_PAIRINGS.find((p) => p.id === 'geometric')!;
    expect(googleFontsUrl(geometric)).toContain('family=Space+Grotesk');
    expect(googleFontsUrl(geometric)).toContain('family=Inter');
  });
});

describe('Índice', () => {
  it('numera las secciones', () => {
    expect(sectionNumber('esencia')).toBe('01');
    expect(sectionNumber('limites')).toBe(String(MANUAL_SECTIONS.length).padStart(2, '0'));
  });
  it('iniciales para el monograma', () => {
    expect(initials('Café Tinto')).toBe('CT');
    expect(initials('nova')).toBe('N');
    expect(initials('  ')).toBe('·');
  });
});
