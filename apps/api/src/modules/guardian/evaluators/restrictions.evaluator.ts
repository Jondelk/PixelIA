import { stem } from '../../content-plans/contentPlanning.grounding.js';
import { refsWithPrefix, type ReferenceEntry } from '../guardian.references.js';
import type { GuardianEvaluator, GuardianFindingDraft, GuardianText } from '../guardian.types.js';
import { quote, wordsOf } from './text.js';

/*
 * RestrictionsEvaluator (determinista). Distingue tres niveles del ADN:
 * - Restricción explícita ("No mostrar café instantáneo"): contradecirla es BLOCK, pero es una
 *   decisión creativa: el usuario puede continuar de todas formas (queda registrado).
 * - Restricción visual ("Neón", "Brillos metálicos"): advertencia alta, sin bloquear.
 * - Lo que la marca rechaza ("Estética corporativa fría"): advertencia media.
 * Las PREFERENCIAS (likes: "luz natural") nunca generan hallazgos: preferir algo no prohíbe lo demás.
 */

/** Verbos de las restricciones ("No mostrar…") y palabras demasiado genéricas para vetar solas. */
const LEAD =
  /^(no\s+)?(mostrar|usar|utilizar|prometer|decir|hablar de|incluir|poner|evitar|nunca)\s+/;
const GENERIC = new Set(
  [
    'estetica',
    'fotografia',
    'imagen',
    'imagenes',
    'visual',
    'colores',
    'color',
    'texturas',
    'cosas',
    'todo',
    'sobre',
    'para',
    'nada',
    'nunca',
    'solo',
  ].map(stem),
);

function keyStems(rule: string): string[] {
  const body = rule.trim().toLowerCase().replace(LEAD, '');
  return [
    ...new Set(
      wordsOf(body)
        .filter((word) => word.length >= 4)
        .map(stem)
        .filter((value) => !GENERIC.has(value)),
    ),
  ];
}

function violates(text: string, rule: string): boolean {
  const stems = keyStems(rule);
  if (!stems.length) return false;
  const words = new Set(wordsOf(text).map(stem));
  const present = stems.filter((value) => words.has(value)).length;
  return present >= Math.max(1, Math.ceil(stems.length * 0.67));
}

interface Level {
  prefix: string;
  code: string;
  severity: GuardianFindingDraft['severity'];
  blocking: boolean;
  title: (entry: ReferenceEntry) => string;
  message: (entry: ReferenceEntry) => string;
  recommendation: string;
}

const LEVELS: Level[] = [
  {
    prefix: 'BRAND_RESTRICTION',
    code: 'explicit_restriction',
    severity: 'high',
    blocking: true,
    title: () => 'Contradice una restricción explícita de la marca',
    message: (entry) =>
      `La marca dejó escrito «${entry.text}» y el texto va en esa dirección. Es una regla de la marca, no una preferencia de estilo.`,
    recommendation:
      'Replantea esa parte para respetar la restricción. Si es una excepción consciente, puedes continuar de todas formas.',
  },
  {
    prefix: 'BRAND_VISUAL_RESTRICTION',
    code: 'visual_restriction',
    severity: 'high',
    blocking: false,
    title: (entry) => `Usa algo que la marca evita: ${entry.text.toLowerCase()}`,
    message: (entry) =>
      `El ADN pide evitar «${entry.text}» en su lenguaje visual y la propuesta lo incluye.`,
    recommendation: 'Sustitúyelo por un recurso del lenguaje visual propio de la marca.',
  },
  {
    prefix: 'BRAND_DISLIKE',
    code: 'brand_dislike',
    severity: 'medium',
    blocking: false,
    title: (entry) => `Se acerca a algo que la marca rechaza: ${entry.text.toLowerCase()}`,
    message: (entry) =>
      `Entre lo que la marca no quiere está «${entry.text}», y esta parte se le parece.`,
    recommendation: 'Revisa ese enfoque; no es una prohibición, pero la marca lo rechaza.',
  },
];

export const restrictionsEvaluator: GuardianEvaluator = {
  id: 'restrictions',
  dimension: 'restrictions',
  semantic: false,
  supports: (input) => input.resource.texts.length > 0,
  evaluate({ input, refs }) {
    const findings: GuardianFindingDraft[] = [];
    const visualTexts: GuardianText[] = input.resource.visualDirection
      ? Object.entries(input.resource.visualDirection)
          .filter(([key]) => key !== 'avoid')
          .flatMap(([key, values]) =>
            (values as string[]).map((value, index) => ({
              ref: `VISUAL_${key}_${index}`,
              label: `Dirección visual → ${key}`,
              text: value,
              role: 'visual' as const,
              field: null,
              targetId: null,
            })),
          )
      : [];
    for (const level of LEVELS) {
      for (const entry of refsWithPrefix(refs, level.prefix)) {
        const hits = [...input.resource.texts, ...visualTexts].filter((text) =>
          violates(text.text, entry.text),
        );
        if (!hits.length) continue;
        findings.push({
          evaluator: 'restrictions',
          dimension: 'restrictions',
          severity: level.severity,
          blocking: level.blocking,
          code: level.code,
          title: level.title(entry),
          message: level.message(entry),
          evidence: hits.slice(0, 3).map((text) => quote(text)),
          brandRefs: [entry.ref],
          recommendation: level.recommendation,
          canAutoFix: false,
          canOverride: true,
          fix: [],
          source: 'deterministic',
        });
      }
    }
    return {
      dimension: 'restrictions',
      findings,
      summary: findings.length ? null : 'No contradice ninguna restricción ni rechazo del ADN.',
    };
  },
};
