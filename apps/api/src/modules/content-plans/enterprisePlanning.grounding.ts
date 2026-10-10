import type { EnterprisePlanningPayload } from '../../ai/index.js';
import {
  campaignClaims,
  conflictsWithRestrictions,
  forbiddenVisualStems,
} from '../campaigns/campaignStrategy.grounding.js';
import {
  buildVocabulary,
  normalize,
  similarity,
  stem,
  type Vocabulary,
} from './contentPlanning.grounding.js';

/*
 * Fundamento del plan editorial de una marca (reglas puras). Reutiliza las del Campaign Manager
 * (cifras y métricas sin base, nombres propios fuera del contexto, claims de mercado, afirmaciones
 * sobre los clientes) y añade las promocionales propias de un plan de contenido: descuentos,
 * precios, gratis, 2x1, sorteos, "el favorito de…". Lo que la marca no dio no se puede afirmar.
 *
 * El vocabulario NO incluye las fechas del periodo ni las fechas sugeridas: "2026" no autoriza
 * "2026 clientes".
 */

export function enterprisePlanningVocabulary(payload: EnterprisePlanningPayload): Vocabulary {
  const { startDate: _start, endDate: _end, days: _days, ...request } = payload.request;
  return buildVocabulary([
    payload.brand,
    payload.campaign,
    payload.deliverables.map(({ ref: _ref, ...deliverable }) => deliverable),
    payload.projects.map(({ ref: _ref, ...project }) => project),
    payload.recentContent.map((item) => item.title),
    request,
  ]);
}

const PROMO_CLAIMS: [RegExp, string][] = [
  [/\bdescuentos?\b|\brebajas?\b|\b\d+\s*%\s*(off|de descuento)/, 'descuent'],
  [/\bofertas?\b|\bpromociones\b|\bpromocion\b/, 'ofert'],
  [/\bgratis\b|\bgratuit[oa]s?\b|\bsin costo\b/, 'gratis'],
  [/\b2x1\b|\b3x2\b|\bcupon(es)?\b|\bsorteos?\b|\bgiveaway\b/, 'cupon'],
  [/\bprecios?\b|\bcuesta\b|\bvale solo\b/, 'precio'],
  [/\bfavorit[oa]s? (de|del|en)\b|\bel preferido de\b/, 'favorit'],
  [/\bclientes? satisfech|\btestimonios?\b|\breseñas?\b|\bresenas?\b/, 'testimoni'],
];

/** Afirmaciones sin base de un texto del plan (vacío = se puede usar). */
export function planningClaims(text: string | null | undefined, vocabulary: Vocabulary): string[] {
  if (!text) return [];
  const claims = campaignClaims(text, vocabulary);
  const plain = normalize(text);
  for (const [pattern, root] of PROMO_CLAIMS) {
    const match = pattern.exec(plain);
    if (match && !vocabulary.words.has(stem(root))) claims.push(match[0]);
  }
  return claims;
}

export const isGrounded = (text: string | null | undefined, vocabulary: Vocabulary) =>
  planningClaims(text, vocabulary).length === 0;

/** Quita las frases con afirmaciones sin base (textos largos). */
export function groundedPlanningText(
  text: string | null | undefined,
  vocabulary: Vocabulary,
): string {
  if (!text) return '';
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && isGrounded(sentence, vocabulary))
    .join(' ')
    .trim();
}

/** Raíces vetadas por el ADN (restricciones visuales, lo que la marca rechaza, palabras a evitar). */
export function forbiddenStemsFor(payload: EnterprisePlanningPayload): Set<string> {
  return forbiddenVisualStems(payload);
}

export const conflictsWithBrand = (text: string, forbidden: Set<string>) =>
  conflictsWithRestrictions(text, forbidden);

/**
 * ¿La pieza desarrolla la estrategia de la campaña? Sí si su pilar es uno de los de la estrategia,
 * si desarrolla una pieza de la campaña o si comparte ideas con su concepto, big idea o mensajes.
 * Evita que el planner sustituya la campaña por contenido genérico ("5 razones para tomar café").
 */
export function developsCampaign(
  item: { pillar: string; title: string; concept: string; strategicMessage?: string | null },
  campaign: NonNullable<EnterprisePlanningPayload['campaign']>,
  hasDeliverable: boolean,
): boolean {
  if (hasDeliverable) return true;
  const pillar = normalize(item.pillar).trim();
  if (campaign.strategy.contentPillars.some((other) => normalize(other.name).trim() === pillar)) {
    return true;
  }
  const text = [item.title, item.concept, item.strategicMessage ?? ''].join(' ');
  const core = [
    campaign.strategy.concept,
    campaign.strategy.bigIdea,
    campaign.strategy.keyMessage,
    ...campaign.strategy.supportingMessages,
  ];
  return core.some((source) => similarity(text, source) >= 0.08);
}
