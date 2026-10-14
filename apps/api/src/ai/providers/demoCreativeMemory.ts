import type { GeneratedCreativeMemorySynthesis } from '@pixel/contracts';
import type { MemoryPayload } from '../creativeMemoryPayload.js';
import { fold } from '../pixelCommandRules.js';

/*
 * Sintetizador de memoria en modo demo: reglas sobre el antes/después de cada evento. Distingue
 * comunicación (urgencia, mayúsculas, exclamaciones), formato, visual y forma de trabajar; si
 * ningún patrón aparece en la mayoría de los eventos, no propone nada (nunca un "fixture" universal).
 */

interface Pattern {
  key: string;
  dimension: NonNullable<GeneratedCreativeMemorySynthesis['dimension']>;
  kind: NonNullable<GeneratedCreativeMemorySynthesis['kind']>;
  statement: string;
  /** ¿El evento muestra el patrón? (lo quitó del antes al después, o lo añadió). */
  test: (before: string, after: string) => boolean;
}

const removed = (pattern: RegExp) => (before: string, after: string) =>
  pattern.test(fold(before)) && !pattern.test(fold(after));
const added = (pattern: RegExp) => (before: string, after: string) =>
  !pattern.test(fold(before)) && pattern.test(fold(after));

const URGENCY =
  /\b(?:compra(?:lo)? ya|ya mismo|ahora o nunca|ultimas unidades|no te lo pierdas|solo hoy|corre|apurate|date prisa|por tiempo limitado)\b/;

const PATTERNS: Pattern[] = [
  {
    key: 'communication:urgency:avoid',
    dimension: 'communication',
    kind: 'communication_preference',
    statement: 'Suele cambiar los CTA de urgencia por invitaciones suaves',
    test: removed(URGENCY),
  },
  {
    key: 'communication:shouting:avoid',
    dimension: 'communication',
    kind: 'communication_preference',
    statement: 'Suele quitar las mayúsculas sostenidas y las exclamaciones de los textos',
    test: (before, after) =>
      (/(?<!\p{L})[A-ZÁÉÍÓÚÑ]{4,}(?!\p{L})/u.test(before) &&
        !/(?<!\p{L})[A-ZÁÉÍÓÚÑ]{4,}(?!\p{L})/u.test(after)) ||
      ((before.match(/!/g) ?? []).length >= 2 && (after.match(/!/g) ?? []).length < 2),
  },
  {
    key: 'communication:questions:prefer',
    dimension: 'communication',
    kind: 'communication_preference',
    statement: 'Suele abrir los textos con una pregunta a su audiencia',
    test: (before, after) => !/^\s*¿/.test(before) && /^\s*¿/.test(after),
  },
  {
    key: 'format:story:avoid',
    dimension: 'format',
    kind: 'avoid',
    statement: 'Suele cambiar las Stories por otros formatos',
    test: removed(/\bstor(?:y|ies)\b|\bhistorias de (?:instagram|ig)\b/),
  },
  {
    key: 'format:carousel:prefer',
    dimension: 'format',
    kind: 'preference',
    statement: 'Suele convertir las piezas en carruseles',
    test: added(/\bcarrusel(?:es)?\b|\bcarousel\b/),
  },
  {
    key: 'visual:neon:avoid',
    dimension: 'visual',
    kind: 'visual_preference',
    statement: 'Suele quitar el neón de la dirección visual',
    test: removed(/\bneon(?:es)?\b/),
  },
  {
    key: 'visual:dark_background:avoid',
    dimension: 'visual',
    kind: 'visual_preference',
    statement: 'Suele cambiar los fondos oscuros por fondos claros',
    test: removed(/\bfondos? (?:oscuros?|negros?)\b/),
  },
  {
    key: 'workflow:short_lists:prefer',
    dimension: 'workflow',
    kind: 'workflow_preference',
    statement: 'Suele recortar las listas largas a unos pocos puntos',
    test: (before, after) =>
      before.split(/\n|,|;/).length >= 5 && after.split(/\n|,|;/).length <= 3,
  },
];

const textOf = (snapshot: { value: string }[]) => snapshot.map((entry) => entry.value).join('\n');

export function composeDemoMemorySynthesis(
  payload: MemoryPayload,
): GeneratedCreativeMemorySynthesis {
  let best: { pattern: Pattern; refs: string[] } | null = null;
  for (const pattern of PATTERNS) {
    const refs = payload.events
      .filter((event) => pattern.test(textOf(event.before), textOf(event.after)))
      .map((event) => event.ref);
    if (!best || refs.length > best.refs.length) best = { pattern, refs };
  }
  // Un patrón cuenta solo si aparece en la mayoría de las decisiones y al menos en 3.
  if (!best || best.refs.length < 3 || best.refs.length * 2 <= payload.events.length) {
    return { shouldCreateCandidate: false, evidenceRefs: [] };
  }
  return {
    shouldCreateCandidate: true,
    kind: best.pattern.kind,
    dimension: best.pattern.dimension,
    normalizedKey: best.pattern.key,
    statement: best.pattern.statement,
    evidenceRefs: best.refs,
    confidence: Math.min(0.8, 0.4 + 0.1 * best.refs.length),
  };
}
