import { CUSTOMER_ASSERTION, MARKET_CLAIMS } from '../../campaigns/campaignStrategy.grounding.js';
import {
  normalize,
  stem,
  unfoundedClaims,
  type Vocabulary,
} from '../../content-plans/contentPlanning.grounding.js';
import { PROMO_CLAIMS } from '../../content-plans/enterprisePlanning.grounding.js';
import type { GuardianEvaluator, GuardianFindingDraft, GuardianText } from '../guardian.types.js';
import { quote } from './text.js';

/*
 * ClaimsEvaluator (determinista). Reutiliza el grounding del Campaign Manager y del planner
 * Enterprise —cifras y métricas sin base, nombres propios fuera del contexto, claims de mercado,
 * afirmaciones sobre los clientes y promociones— y añade solo los patrones de superioridad que
 * faltaban ("#1", "el mejor café del…", "el más…"). Lo fundamenta el vocabulario del contexto:
 * ADN + campaña + lo que aportó el usuario. Las fechas NO fundamentan cifras (corrección
 * existente: el vocabulario no incluye fechas del periodo).
 *
 * Política: una promoción, un claim de mercado o una cifra sin base son integridad factual →
 * BLOCK, sin "continuar de todas formas" (se corrige o se aporta el dato). Un nombre propio o una
 * afirmación sobre los clientes → advertencia.
 */

const SUPERIORITY: [RegExp, string][] = [
  [/#\s?1\b/, 'numero'],
  [/\b(el|la|los|las) (mejor(es)?|mas [a-z]+) [a-z]+ (del|de la|de|en) [a-z]+/, 'mejor'],
  [/\bnumero (1|uno)\b/, 'numero'],
];

interface Claim {
  kind: 'promotion' | 'market' | 'figure' | 'proper_name' | 'customer';
  match: string;
}

/** Claims de un texto, clasificados (vacío = fundamentado). */
export function classifyClaims(text: string, vocabulary: Vocabulary): Claim[] {
  const plain = normalize(text);
  const claims: Claim[] = [];
  const grounded = (root: string) => vocabulary.words.has(stem(root));
  for (const [pattern, root] of PROMO_CLAIMS) {
    const match = pattern.exec(plain);
    if (match && !grounded(root)) claims.push({ kind: 'promotion', match: match[0] });
  }
  for (const [pattern, root] of [...MARKET_CLAIMS, ...SUPERIORITY]) {
    const match = pattern.exec(plain);
    if (match && !grounded(root) && !claims.some((claim) => claim.match.includes(match[0]))) {
      claims.push({ kind: 'market', match: match[0] });
    }
  }
  const assertion = CUSTOMER_ASSERTION.exec(plain);
  if (assertion) claims.push({ kind: 'customer', match: assertion[0] });
  for (const value of unfoundedClaims(text, vocabulary)) {
    if (claims.some((claim) => claim.match.includes(normalize(value)))) continue;
    if (/\d/.test(value)) claims.push({ kind: 'figure', match: value });
    else if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(value))
      continue; // un grito («YA»): lo cubre Comunicación
    else if (/^[A-ZÁÉÍÓÚÑ]/.test(value)) claims.push({ kind: 'proper_name', match: value });
    else claims.push({ kind: 'customer', match: value });
  }
  return claims;
}

const COPY: Record<
  Claim['kind'],
  Pick<GuardianFindingDraft, 'severity' | 'blocking' | 'code' | 'canOverride' | 'canAutoFix'> & {
    title: string;
    message: (match: string) => string;
    recommendation: string;
  }
> = {
  promotion: {
    severity: 'critical',
    blocking: true,
    code: 'invented_promotion',
    canOverride: false,
    canAutoFix: true,
    title: 'Promoción que la marca no ha dado',
    message: (match) =>
      `El texto anuncia «${match}», pero ni el ADN ni la campaña ni tus datos confirmados recogen esa promoción. Prometerla sin que exista es un riesgo comercial y de confianza.`,
    recommendation:
      'Quita la promoción o, si existe de verdad, añádela como dato confirmado antes de usarla.',
  },
  market: {
    severity: 'high',
    blocking: true,
    code: 'ungrounded_market_claim',
    canOverride: false,
    canAutoFix: true,
    title: 'Claim de superioridad sin fundamento',
    message: (match) =>
      `«${match}» afirma una posición en el mercado que no está respaldada por el ADN ni por datos aportados. Es una afirmación factual, no un rasgo de tono.`,
    recommendation:
      'Elimina el claim o sustitúyelo por un diferenciador real de la marca. Si tienes la fuente, aporta el dato.',
  },
  figure: {
    severity: 'high',
    blocking: true,
    code: 'ungrounded_figure',
    canOverride: false,
    canAutoFix: true,
    title: 'Cifra sin fuente',
    message: (match) =>
      `«${match}» presenta una cifra como hecho, pero no aparece en el ADN, la campaña ni los datos que aportaste. Una fecha no cuenta como fuente de una cifra.`,
    recommendation: 'Quita la cifra o aporta el dato real como dato confirmado.',
  },
  proper_name: {
    severity: 'medium',
    blocking: false,
    code: 'unknown_proper_name',
    canOverride: true,
    canAutoFix: true,
    title: 'Nombre propio que la marca no menciona',
    message: (match) =>
      `«${match}» no aparece en el ADN ni en la campaña. Si es un lugar, cliente o producto real, conviene confirmarlo; si no, puede inducir a error.`,
    recommendation: 'Confírmalo como dato o quítalo del texto.',
  },
  customer: {
    severity: 'medium',
    blocking: false,
    code: 'customer_assertion',
    canOverride: true,
    canAutoFix: false,
    title: 'Afirmación sobre los clientes sin medir',
    message: (match) =>
      `«${match}» da por sabido lo que sienten o prefieren los clientes, y no hay ningún dato que lo respalde.`,
    recommendation:
      'Habla de lo que la marca hace, no de lo que supuestamente piensan sus clientes.',
  },
};

function findingFor(text: GuardianText, claim: Claim): GuardianFindingDraft {
  const copy = COPY[claim.kind];
  return {
    evaluator: 'claims',
    dimension: 'claims',
    severity: copy.severity,
    blocking: copy.blocking,
    code: copy.code,
    title: copy.title,
    message: copy.message(claim.match),
    evidence: [quote(text)],
    brandRefs: [],
    brandEvidence: ['ADN, campaña y datos confirmados: no registran esta afirmación'],
    recommendation: copy.recommendation,
    canAutoFix: copy.canAutoFix,
    canOverride: copy.canOverride,
    fix: copy.canAutoFix
      ? [
          {
            ref: text.ref,
            // Una promoción o una cifra se van con su cláusula; un claim de superioridad, palabra a
            // palabra ("el café #1" → "el café"), para no vaciar el texto.
            kind:
              claim.kind === 'proper_name'
                ? 'remove_proper_name'
                : claim.kind === 'market'
                  ? 'remove_claim'
                  : 'remove_phrase',
            match: claim.match,
          },
        ]
      : [],
    source: 'deterministic',
  };
}

export const claimsEvaluator: GuardianEvaluator = {
  id: 'claims',
  dimension: 'claims',
  semantic: false,
  supports: (input) => input.resource.texts.length > 0,
  evaluate({ input, vocabulary }) {
    const findings: GuardianFindingDraft[] = [];
    for (const text of input.resource.texts) {
      for (const claim of classifyClaims(text.text, vocabulary)) {
        findings.push(findingFor(text, claim));
      }
    }
    return {
      dimension: 'claims',
      findings,
      summary: findings.length
        ? null
        : 'No hay cifras, promociones ni claims de mercado sin fundamento.',
    };
  },
};
