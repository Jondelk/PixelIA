import type { BrandArchetype } from '@pixel/contracts';

export type PersonalityAxis = 'innovation' | 'sophistication' | 'warmth' | 'playfulness';

export interface LexiconEntry {
  /** Afinidad con cada arquetipo (aprox. 0–3). */
  archetypes: Partial<Record<BrandArchetype, number>>;
  /** Desplazamiento en cada eje de personalidad, de -1 a 1. */
  axes?: Partial<Record<PersonalityAxis, number>>;
}

/**
 * Vocabulario que Pixel reconoce en personalidad y tono. Las claves son raíces normalizadas
 * (sin tildes ni terminación de género/número): "innovadora" e "innovador" → "innovador".
 * Las palabras que no están aquí se conservan como rasgos propios de la marca.
 */
export const LEXICON: Record<string, LexiconEntry> = {
  innovador: { archetypes: { creator: 2, magician: 1, explorer: 1 }, axes: { innovation: 1 } },
  tradicional: {
    archetypes: { caregiver: 1, everyman: 1, sage: 1, ruler: 1 },
    axes: { innovation: -1 },
  },
  elegant: { archetypes: { lover: 2, ruler: 1 }, axes: { sophistication: 1 } },
  joven: {
    archetypes: { jester: 1, explorer: 1, rebel: 1 },
    axes: { innovation: 0.5, playfulness: 0.5 },
  },
  cercan: { archetypes: { everyman: 2, caregiver: 2 }, axes: { warmth: 1 } },
  artesanal: {
    archetypes: { creator: 2, caregiver: 1, innocent: 1 },
    axes: { innovation: -0.5, warmth: 0.5, sophistication: 0.2 },
  },
  tecnologic: {
    archetypes: { magician: 2, sage: 1, creator: 1 },
    axes: { innovation: 1, warmth: -0.3 },
  },
  atrevid: {
    archetypes: { rebel: 2, hero: 1, explorer: 1 },
    axes: { innovation: 0.5, playfulness: 0.3 },
  },
  premium: { archetypes: { ruler: 2, lover: 1 }, axes: { sophistication: 1 } },
  divertid: { archetypes: { jester: 3 }, axes: { playfulness: 1, warmth: 0.5 } },
  minimalist: {
    archetypes: { sage: 1, innocent: 1, ruler: 1 },
    axes: { sophistication: 0.5, playfulness: -0.3 },
  },
  confiabl: { archetypes: { caregiver: 1, everyman: 1, ruler: 1 }, axes: { warmth: 0.3 } },
  calid: { archetypes: { caregiver: 2, lover: 1 }, axes: { warmth: 1 } },
  expert: { archetypes: { sage: 2, ruler: 1 }, axes: { sophistication: 0.5 } },
  sostenibl: { archetypes: { innocent: 1, caregiver: 1, explorer: 1 } },
  solid: { archetypes: { ruler: 2, hero: 1 }, axes: { innovation: -0.3, playfulness: -0.3 } },
  aventurer: { archetypes: { explorer: 3 }, axes: { playfulness: 0.3 } },
  inspirador: { archetypes: { hero: 1, magician: 1, creator: 1 } },
  autentic: { archetypes: { everyman: 1, innocent: 1, creator: 1 }, axes: { warmth: 0.3 } },
  seri: { archetypes: { sage: 1, ruler: 1 }, axes: { playfulness: -1 } },
  lujos: { archetypes: { lover: 2, ruler: 1 }, axes: { sophistication: 1 } },
  human: { archetypes: { caregiver: 2, everyman: 1 }, axes: { warmth: 1 } },
  rebeld: { archetypes: { rebel: 3 }, axes: { innovation: 0.5 } },
  creativ: { archetypes: { creator: 2, magician: 1 }, axes: { innovation: 0.5 } },
  precis: { archetypes: { sage: 2, ruler: 1 }, axes: { sophistication: 0.5, playfulness: -0.3 } },
  optimist: { archetypes: { innocent: 2, jester: 1 }, axes: { warmth: 0.5 } },
  natural: { archetypes: { innocent: 2, explorer: 1 }, axes: { sophistication: -0.2 } },
  sencill: { archetypes: { everyman: 2, innocent: 1 }, axes: { sophistication: -0.5 } },
  sofisticad: { archetypes: { lover: 1, ruler: 1 }, axes: { sophistication: 1 } },
  modern: { archetypes: { creator: 1, magician: 1 }, axes: { innovation: 0.7 } },
  fuert: { archetypes: { hero: 2, ruler: 1 }, axes: { playfulness: -0.2 } },
  amigabl: { archetypes: { everyman: 2, caregiver: 1 }, axes: { warmth: 0.7 } },
  audaz: { archetypes: { rebel: 2, hero: 1 }, axes: { innovation: 0.5 } },
  direct: { archetypes: { hero: 1, ruler: 1 }, axes: { warmth: -0.2 } },
  seren: { archetypes: { innocent: 1, sage: 1 }, axes: { playfulness: -0.3 } },
  tecnic: { archetypes: { sage: 2 }, axes: { sophistication: 0.3, warmth: -0.3 } },
  empatic: { archetypes: { caregiver: 2 }, axes: { warmth: 1 } },
};

/** Señales de forma desde "Formas" (peso 1) y "Estilo visual" (peso 0.5). */
export const SHAPE_SIGNALS: Record<
  string,
  'organic' | 'geometric' | 'structural' | 'fluid' | 'soft'
> = {
  organic: 'organic',
  organ: 'organic',
  redondead: 'soft',
  suav: 'soft',
  geometric: 'geometric',
  angular: 'geometric',
  estructural: 'structural',
  fluid: 'fluid',
};

export const STYLE_SHAPE_SIGNALS: Record<
  string,
  'organic' | 'geometric' | 'structural' | 'fluid' | 'soft'
> = {
  organic: 'organic',
  artesanal: 'organic',
  natural: 'organic',
  industrial: 'structural',
  brutalist: 'structural',
  futurist: 'geometric',
  minimalist: 'geometric',
  tecnologic: 'geometric',
  ludic: 'soft',
};

/** "Innovadoras" → "innovador"; "cálida" → "calid"; "Tecnológico" → "tecnologic". */
export function lexiconKey(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.length > 4 ? normalized.replace(/(as|os|es|a|o|e|s)$/, '') : normalized;
}
