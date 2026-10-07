import type { BrandArchetype } from '@pixel/contracts';
import { LEXICON, lexiconKey } from '../brand-dna/brandDna.lexicon.js';

/**
 * Rasgos de personalidad → arquetipos (los mismos 12 de marca). Reutiliza el léxico de marca y lo
 * amplía con rasgos frecuentes en personas que una marca rara vez usa. Las claves son raíces
 * normalizadas por `lexiconKey` ("Curiosa" → "curios"). Un rasgo que no está aquí se conserva tal
 * cual en el ADN, pero no aporta arquetipo: nunca se adivina.
 */
const PERSONAL_EXTRAS: Record<string, Partial<Record<BrandArchetype, number>>> = {
  curios: { explorer: 2, sage: 1 },
  estrategic: { sage: 2, ruler: 1 },
  analitic: { sage: 2 },
  reflexiv: { sage: 2 },
  introvertid: { sage: 1, innocent: 1 },
  tranquil: { innocent: 1, sage: 1 },
  disciplinad: { ruler: 2, hero: 1 },
  organizad: { ruler: 2 },
  perfeccionist: { ruler: 1, creator: 1 },
  detallist: { sage: 1, creator: 1 },
  lider: { ruler: 2, hero: 1 },
  competitiv: { hero: 3 },
  energetic: { hero: 1, jester: 1, explorer: 1 },
  energic: { hero: 1, jester: 1, explorer: 1 },
  apasionad: { lover: 2, hero: 1 },
  carismatic: { jester: 1, hero: 1, lover: 1 },
  extrovertid: { jester: 2, everyman: 1 },
  espontane: { jester: 1, explorer: 1 },
  ludic: { jester: 2 },
  colorid: { jester: 1, creator: 1 },
  visionari: { magician: 2, creator: 1 },
  independient: { explorer: 2, rebel: 1 },
  autodidact: { explorer: 1, sage: 1 },
  comunitari: { everyman: 2, caregiver: 1 },
  editorial: { sage: 1, creator: 1 },
};

/** Afinidad de un rasgo con cada arquetipo; vacío si Pixel no reconoce el rasgo. */
export function traitArchetypes(trait: string): Partial<Record<BrandArchetype, number>> {
  const key = lexiconKey(trait);
  return PERSONAL_EXTRAS[key] ?? LEXICON[key]?.archetypes ?? {};
}
