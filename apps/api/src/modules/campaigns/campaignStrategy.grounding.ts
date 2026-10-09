import type { CampaignPayload } from '../../ai/index.js';
import {
  buildVocabulary,
  normalize,
  similarity,
  stem,
  unfoundedClaims,
  type Vocabulary,
} from '../content-plans/contentPlanning.grounding.js';

/*
 * Fundamento de una estrategia de campaña (reglas puras). Reutiliza las del Content Planner
 * (cifras y métricas sin base, nombres propios fuera del contexto) y añade las propias de una marca:
 * claims de mercado ("líder del mercado", "el mejor", "premiado", "certificado"), afirmaciones
 * sobre lo que valoran los clientes y cifras de experiencia ("50 años de trayectoria").
 *
 * A diferencia del Content Planner, el vocabulario NO incluye las fechas del periodo (ni ningún
 * número que no sea del ADN o del brief): así "15 años de experiencia" no pasa porque el día 15
 * aparezca en el periodo.
 */

export function campaignVocabulary(payload: CampaignPayload): Vocabulary {
  const { period: _period, ...brief } = payload.brief;
  return buildVocabulary([
    payload.brand,
    brief,
    payload.activeProjects.map((project) => project.name),
    payload.recentContent.map((item) => item.title),
  ]);
}

/** Claims de mercado o de producto que la marca tiene que haber dado para poder usarlos. */
const MARKET_CLAIMS: [RegExp, string][] = [
  [/\blider(es)? (del|en el|de la) (mercado|categoria|sector)\b/, 'lider'],
  [/\bnumero (1|uno)\b/, 'numero'],
  [
    /\b(el|la|los|las) (mejor(es)?|unic[oa]s?) (del|de la|de) (pais|mundo|mercado|categoria|region)\b/,
    'mejor',
  ],
  [/\bpremiad[oa]s?\b|\bgalardonad[oa]s?\b|\bpremios?\b/, 'premi'],
  [/\bcertificad[oa]s?\b|\bcertificacion(es)?\b/, 'certific'],
  [/\bgarantizad[oa]s?\b|\bgarantia\b/, 'garanti'],
  [/\bmas vendid[oa]s?\b|\bpreferid[oa]s? por\b/, 'vendid'],
  [/\bclinicamente\b|\bcientificamente probad/, 'probad'],
];

/** "Nuestros clientes valoran…", "los consumidores prefieren…": nadie lo ha medido. */
export const CUSTOMER_ASSERTION =
  /\b(nuestros?|nuestras?|tus?|sus|los|las|el|la) (clientes?|consumidor(es)?|compradores?|usuarios?|audiencia|publico|comunidad)( [a-z]+){0,2} (prefieren?|valoran?|aman?|adoran?|exigen?|eligen? siempre|confian?|recomiendan?)\b/;

/**
 * Afirmaciones sin base de un texto de campaña (vacío = se puede usar). `hypothesis`: el texto es un
 * insight; afirmar algo sobre los clientes no se veta ahí (el insight se marca como hipótesis).
 */
export function campaignClaims(
  text: string | null | undefined,
  vocabulary: Vocabulary,
  { hypothesis = false }: { hypothesis?: boolean } = {},
): string[] {
  if (!text) return [];
  const claims = unfoundedClaims(text, vocabulary);
  const plain = normalize(text);
  for (const [pattern, root] of MARKET_CLAIMS) {
    const match = pattern.exec(plain);
    if (match && !vocabulary.words.has(stem(root))) claims.push(match[0]);
  }
  const assertion = CUSTOMER_ASSERTION.exec(plain);
  if (assertion && !hypothesis) claims.push(assertion[0]);
  return claims;
}

export const isClean = (text: string | null | undefined, vocabulary: Vocabulary) =>
  campaignClaims(text, vocabulary).length === 0;

/** Quita las frases con afirmaciones sin base (textos largos: narrativa, rationale…). */
export function groundedCampaignText(text: string, vocabulary: Vocabulary): string {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && isClean(sentence, vocabulary))
    .join(' ')
    .trim();
}

/** Palabras clave (raíces) de las restricciones visuales y lo que la marca rechaza. */
export function forbiddenVisualStems(payload: CampaignPayload): Set<string> {
  const { restrictions, dislikes } = payload.brand;
  const words = [...restrictions.visual, ...dislikes, ...payload.brand.communication.avoidWords]
    .flatMap((value) => normalize(value).split(/[^a-z0-9ñ]+/))
    .filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word))
    .map(stem);
  return new Set(words);
}

/** Palabras demasiado genéricas para vetar por sí solas ("estética", "fotografía"…). */
const GENERIC_WORDS = new Set(
  [
    'estetica',
    'fotografia',
    'imagen',
    'imagenes',
    'visual',
    'colores',
    'color',
    'texturas',
    'sobre',
    'para',
    'como',
    'desde',
    'entre',
    'nunca',
    'solo',
    'mostrar',
    'todo',
    'todos',
    'cosas',
  ].map(normalize),
);

/** ¿El texto propone algo que la marca veta (neón si evita el neón, cyberpunk si evita lo frío…)? */
export function conflictsWithRestrictions(text: string, forbidden: Set<string>): boolean {
  return normalize(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length >= 4)
    .some((word) => forbidden.has(stem(word)));
}

/** ¿Un color propuesto pertenece a la paleta del ADN (por nombre o hex)? */
export function isPaletteColor(text: string, payload: CampaignPayload): boolean {
  const plain = normalize(text);
  return payload.brand.visual.palette.some(
    (color) =>
      plain.includes(color.hex.toLowerCase()) ||
      (color.name !== null && plain.includes(normalize(color.name))),
  );
}

/** Canal del brief que corresponde a un texto libre ("Instagram Reels" → "Instagram"). */
export function matchChannel(text: string, channels: string[]): string | null {
  const plain = normalize(text);
  return (
    channels.find((channel) => {
      const key = normalize(channel);
      return plain.includes(key) || key.includes(plain);
    }) ?? null
  );
}

/**
 * Un insight solo puede decir que sale del ADN o del brief si se apoya en ellos (comparte ideas con
 * las necesidades, problemas o el brief); si no, es una hipótesis estratégica.
 */
export function insightSupportedBy(insight: string, sources: string[]): boolean {
  return sources.some((source) => source && similarity(insight, source) >= 0.12);
}
