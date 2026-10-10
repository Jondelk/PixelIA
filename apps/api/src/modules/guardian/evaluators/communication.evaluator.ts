import { normalize, stem } from '../../content-plans/contentPlanning.grounding.js';
import { refsWithPrefix } from '../guardian.references.js';
import type { GuardianEvaluator, GuardianFindingDraft, GuardianText } from '../guardian.types.js';
import { quote, wordsOf } from './text.js';

/*
 * CommunicationEvaluator. Parte determinista (sin gastar IA en lo exacto):
 * - palabras que la marca evita (vocabulary.avoid), por raíz;
 * - gritos (MAYÚSCULAS, "!!!") y presión de urgencia ("¡Compra ya!", "última oportunidad"),
 *   ponderados por la energía, la formalidad y la cercanía del ADN;
 * - idioma: un texto claramente en otro idioma que el del ADN (por palabras funcionales, así los
 *   nombres de producto y los términos técnicos no penalizan).
 * El tono semántico (cálido frente a frío, cercano frente a distante) lo aporta la evaluación
 * semántica (IA o demo).
 */

const URGENCY =
  /\b(compra(lo|la)? ya|compralo|ya mismo|ultima oportunidad|no te lo pierdas|solo hoy|imperdible|apurate|date prisa|corre a|antes de que se acabe|por tiempo limitado|aprovecha ya)\b/;

const FUNCTION_WORDS: Record<string, Set<string>> = {
  es: new Set([
    'el',
    'la',
    'los',
    'las',
    'de',
    'del',
    'que',
    'y',
    'en',
    'con',
    'para',
    'por',
    'una',
    'un',
    'tu',
    'su',
    'nuestro',
    'nuestra',
    'es',
    'mas',
  ]),
  en: new Set([
    'the',
    'and',
    'of',
    'to',
    'in',
    'with',
    'for',
    'your',
    'our',
    'is',
    'are',
    'a',
    'an',
    'this',
    'that',
    'it',
    'you',
    'we',
  ]),
};

function detectLanguage(text: string): 'es' | 'en' | null {
  const words = normalize(text)
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (words.length < 5) return null;
  const count = (lang: string) => words.filter((word) => FUNCTION_WORDS[lang]!.has(word)).length;
  const es = count('es');
  const en = count('en');
  if (en >= 3 && en > es * 2) return 'en';
  if (es >= 3 && es > en * 2) return 'es';
  return null;
}

/** Palabras en mayúsculas que gritan (no siglas cortas ni el nombre de la marca o del producto). */
function shoutedWords(text: string, allowed: Set<string>): string[] {
  return (text.match(/(?<!\p{L})[A-ZÁÉÍÓÚÑ]{4,}(?!\p{L})/gu) ?? []).filter(
    (word) => !allowed.has(stem(normalize(word))),
  );
}

export const communicationEvaluator: GuardianEvaluator = {
  id: 'communication',
  dimension: 'communication',
  semantic: true,
  supports: (input) => input.resource.texts.length > 0,
  evaluate({ input, refs, vocabulary }) {
    const findings: GuardianFindingDraft[] = [];
    const dna = input.brandDna;
    const calm =
      dna.communication.energy.level <= 3 ||
      dna.personality.dimensions.energy <= 55 ||
      dna.communication.formality.level >= 4;
    const toneRefs = [
      ...refsWithPrefix(refs, 'BRAND_TONE'),
      ...refsWithPrefix(refs, 'BRAND_ENERGY'),
      ...refsWithPrefix(refs, 'BRAND_FORMALITY'),
    ].map((entry) => entry.ref);

    // Palabras que la marca evita.
    for (const entry of refsWithPrefix(refs, 'BRAND_AVOID_WORD')) {
      const target = stem(normalize(entry.text));
      const hits = input.resource.texts.filter((text) =>
        wordsOf(text.text).some((word) => stem(word) === target),
      );
      if (!hits.length) continue;
      const preferred = refsWithPrefix(refs, 'BRAND_PREFERRED_WORD').map((item) => item.text);
      findings.push({
        evaluator: 'communication',
        dimension: 'communication',
        severity: 'medium',
        blocking: false,
        code: 'avoid_word',
        title: `Usa «${entry.text}», una palabra que la marca evita`,
        message: `El ADN marca «${entry.text}» como palabra a evitar y aparece en el texto.`,
        evidence: hits.slice(0, 3).map((text) => quote(text)),
        brandRefs: [entry.ref],
        recommendation: preferred.length
          ? `Reformula sin «${entry.text}»; la marca prefiere palabras como ${preferred
              .slice(0, 3)
              .map((word) => `«${word}»`)
              .join(', ')}.`
          : `Reformula sin «${entry.text}».`,
        canAutoFix: false,
        canOverride: true,
        fix: [],
        source: 'deterministic',
      });
    }

    // Gritos y urgencia.
    for (const text of input.resource.texts) {
      const shouted = shoutedWords(text.text, vocabulary.words);
      const exclamations =
        /!{2,}|¡[^!]*!.*¡/.test(text.text) || (text.text.match(/!/g) ?? []).length >= 2;
      const urgency = URGENCY.exec(normalize(text.text));
      if (!shouted.length && !exclamations && !urgency) continue;
      const signals = [
        ...(urgency ? [`presión de urgencia («${urgency[0]}»)`] : []),
        ...(shouted.length ? [`mayúsculas (${shouted.slice(0, 3).join(', ')})`] : []),
        ...(exclamations ? ['exclamaciones repetidas'] : []),
      ];
      findings.push({
        evaluator: 'communication',
        dimension: 'communication',
        severity: calm ? 'high' : 'medium',
        blocking: false,
        code: 'aggressive_tone',
        title: 'El tono es más agresivo que el de la marca',
        message: `El texto usa ${signals.join(', ')}. ${calm ? `Para una marca de tono ${dna.communication.tone.join(', ')} y energía ${dna.communication.energy.label.toLowerCase()}, se siente como un empujón de venta.` : 'Incluso para una marca enérgica, la presión resta credibilidad.'}`,
        evidence: [quote(text)],
        brandRefs: toneRefs,
        recommendation:
          'Cambia la urgencia por una invitación (por ejemplo, «Descubre…», «Conoce…») y escribe sin mayúsculas sostenidas.',
        canAutoFix: true,
        canOverride: true,
        fix: [
          ...(urgency
            ? [{ ref: text.ref, kind: 'soften_urgency' as const, match: urgency[0] }]
            : []),
          ...(shouted.length || exclamations
            ? [{ ref: text.ref, kind: 'normalize_shouting' as const, match: shouted.join(' ') }]
            : []),
        ],
        source: 'deterministic',
      });
    }

    // Idioma.
    const expected = dna.communication.language.code;
    const offLanguage = input.resource.texts.filter((text: GuardianText) => {
      const detected = detectLanguage(text.text);
      return detected !== null && detected !== expected && (expected === 'es' || expected === 'en');
    });
    if (offLanguage.length) {
      findings.push({
        evaluator: 'communication',
        dimension: 'communication',
        severity: 'medium',
        blocking: false,
        code: 'language_mismatch',
        title: `El texto no está en ${dna.communication.language.name.toLowerCase()}`,
        message: `La marca se comunica en ${dna.communication.language.name.toLowerCase()} y este texto está en otro idioma (los nombres de producto y términos técnicos no cuentan).`,
        evidence: offLanguage.slice(0, 2).map((text) => quote(text)),
        brandRefs: refsWithPrefix(refs, 'BRAND_LANGUAGE').map((entry) => entry.ref),
        recommendation: `Escríbelo en ${dna.communication.language.name.toLowerCase()}.`,
        canAutoFix: false,
        canOverride: true,
        fix: [],
        source: 'deterministic',
      });
    }

    return {
      dimension: 'communication',
      findings,
      summary: findings.length
        ? null
        : `El texto respeta el tono ${dna.communication.tone.join(', ')} de la marca.`,
    };
  },
};
