import { BrandOnboardingSchema, type BrandOnboarding } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { generateBrandDna, joinEs } from '../src/modules/brand-dna/brandDna.generator.js';
import { lexiconKey } from '../src/modules/brand-dna/brandDna.lexicon.js';
import { cafeTinto, constructoraNorte, novaLabs } from './fixtures/onboarding.js';

const parse = (input: unknown): BrandOnboarding => BrandOnboardingSchema.parse(input);

describe('generateBrandDna', () => {
  it('estructura el ADN del café artesanal (no un bloque de texto)', () => {
    const dna = generateBrandDna(parse(cafeTinto));

    expect(dna.identity.essence).toBe(
      'Café Tinto es una marca artesanal, cercana y cálida de café de especialidad, con origen en Huila, Colombia.',
    );
    expect(dna.purpose.values).toEqual(['Origen', 'Oficio', 'Comercio justo']);
    expect(['creator', 'caregiver']).toContain(dna.archetypes.primary.id);
    expect(dna.archetypes.primary.score).toBe(100);
    expect(dna.archetypes.primary.signals.length).toBeGreaterThan(0);

    expect(dna.personality.traits[0]).toEqual({ label: 'artesanal', weight: 1, recognized: true });
    expect(dna.personality.traits.find((trait) => trait.label === 'Huilense')?.recognized).toBe(
      false,
    );
    expect(dna.personality.dimensions.warmth).toBeGreaterThan(70);
    expect(dna.personality.dimensions.innovation).toBeLessThan(50);

    expect(dna.communication.formality).toEqual({ level: 2, label: 'Informal' });
    expect(dna.communication.language).toEqual({ code: 'es', name: 'Español' });
    expect(dna.communication.guidelines.do).toContain('Tutea y usa un lenguaje cotidiano.');
    expect(dna.communication.guidelines.dont[0]).toContain('«barato»');

    expect(dna.visualLanguage.palette.map((color) => [color.hex, color.role])).toEqual([
      ['#6B3E26', 'primary'],
      ['#A9714B', 'secondary'],
      ['#E8C07D', 'accent'],
      ['#F5EFE6', 'neutral'],
    ]);
    expect(dna.visualLanguage.temperature).toBe('warm');
    expect(dna.visualLanguage.shapeLanguage).toBe('organic');

    expect(dna.restrictions).toEqual({
      creative: ['No mostrar café instantáneo'],
      words: ['barato', 'instantáneo'],
      visual: ['Neón', 'Brillos metálicos'],
    });
  });

  it('distingue una startup tecnológica', () => {
    const dna = generateBrandDna(parse(novaLabs));
    // "precisa", "minimalista" y el tono "experto" pesan hacia Sabio; la innovación aparece después.
    expect(dna.archetypes.primary.id).toBe('sage');
    expect(dna.archetypes.ranking.map((match) => match.id)).toEqual(
      expect.arrayContaining(['creator', 'magician']),
    );
    expect(dna.personality.dimensions.innovation).toBeGreaterThan(80);
    expect(dna.personality.dimensions.energy).toBe(75);
    expect(dna.visualLanguage.temperature).toBe('cool');
    expect(dna.visualLanguage.shapeLanguage).toBe('geometric');
    expect(dna.visualLanguage.palette[0]?.role).toBe('neutral');
    expect(dna.visualLanguage.palette[1]?.role).toBe('primary');
  });

  it('distingue una constructora', () => {
    const dna = generateBrandDna(parse(constructoraNorte));
    expect(dna.archetypes.primary.id).toBe('ruler');
    expect(dna.visualLanguage.shapeLanguage).toBe('structural');
    expect(dna.communication.guidelines.dont).toContain(
      'No uses emojis ni expresiones coloquiales.',
    );
    expect(dna.personality.dimensions.playfulness).toBeLessThan(40);
  });

  it('es determinístico', () => {
    expect(generateBrandDna(parse(cafeTinto))).toEqual(generateBrandDna(parse(cafeTinto)));
  });

  it('usa "persona común" cuando no reconoce ningún rasgo', () => {
    const dna = generateBrandDna(
      parse({
        ...cafeTinto,
        personality: { attributes: ['zeta', 'omega', 'kappa'] },
        communication: { ...cafeTinto.communication, tone: ['plano'] },
      }),
    );
    expect(dna.archetypes.primary).toEqual({ id: 'everyman', score: 100, signals: [] });
    expect(dna.archetypes.secondary).toBeNull();
  });
});

describe('utilidades', () => {
  it('lexiconKey reconoce variantes de género, número y tildes', () => {
    expect(lexiconKey('Innovadora')).toBe(lexiconKey('innovador'));
    expect(lexiconKey('Tecnológicos')).toBe(lexiconKey('tecnológica'));
    expect(lexiconKey('cálida')).toBe('calid');
  });

  it('joinEs une en español', () => {
    expect(joinEs(['a'])).toBe('a');
    expect(joinEs(['a', 'b', 'c'])).toBe('a, b y c');
  });
});
