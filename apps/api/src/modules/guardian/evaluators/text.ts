import { normalize, stem } from '../../content-plans/contentPlanning.grounding.js';
import type { GuardianText } from '../guardian.types.js';

/* Utilidades de texto de los evaluadores (sobre la normalización del grounding existente). */

export const wordsOf = (text: string) =>
  normalize(text)
    .split(/[^a-z0-9ñ#%]+/)
    .filter(Boolean);

/** Raíces significativas (≥ 4 letras) de un texto. */
export const stemsOf = (text: string) =>
  new Set(
    wordsOf(text)
      .filter((word) => word.length >= 4)
      .map(stem),
  );

/** ¿El texto contiene la palabra o expresión (por raíces, sin tildes)? */
export function containsTerm(text: string, term: string): boolean {
  const termStems = wordsOf(term)
    .filter((word) => word.length >= 3)
    .map(stem);
  if (!termStems.length) return false;
  const textStems = new Set(wordsOf(text).map(stem));
  return termStems.every((value) => textStems.has(value));
}

/** Textos de un recurso que contienen alguno de los términos. */
export function textsWith(
  texts: GuardianText[],
  terms: string[],
): { text: GuardianText; term: string }[] {
  const hits: { text: GuardianText; term: string }[] = [];
  for (const text of texts) {
    for (const term of terms) {
      if (containsTerm(text.text, term)) hits.push({ text, term });
    }
  }
  return hits;
}

/** Cita breve para la evidencia: `Título: «…»`. */
export const quote = (text: GuardianText, max = 140) =>
  `${text.label}: «${text.text.length > max ? `${text.text.slice(0, max - 1).trimEnd()}…` : text.text}»`;

export const unique = <T>(values: T[]) => [...new Set(values)];
