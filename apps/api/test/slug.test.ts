import { describe, expect, it } from 'vitest';
import { nextAvailableSlug, slugify } from '../src/modules/companies/slug.js';

describe('slugify', () => {
  it('normaliza acentos, símbolos y espacios', () => {
    expect(slugify('Café Tinto & Co.')).toBe('cafe-tinto-co');
    expect(slugify('  Constructora   Norte  ')).toBe('constructora-norte');
  });

  it('usa un valor por defecto si no queda nada', () => {
    expect(slugify('***')).toBe('empresa');
  });
});

describe('nextAvailableSlug', () => {
  it('añade un sufijo incremental', () => {
    expect(nextAvailableSlug('cafe', new Set())).toBe('cafe');
    expect(nextAvailableSlug('cafe', new Set(['cafe', 'cafe-2']))).toBe('cafe-3');
  });
});
