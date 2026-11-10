import {
  CreativeSignalSchema,
  type ContentFormat,
  type ContentPlatform,
  type CreativeMemoryDimension,
  type CreativeMemoryPolarity,
  type CreativeSignal,
  type CreativeSignalAction,
  type CreativeSignalStrength,
} from '@pixel/contracts';
import { fold } from '../../ai/index.js';
import { memoryKey, subjectsIn } from './memory.lexicon.js';

/*
 * Decisión → señales normalizadas (docs/CREATIVE-MEMORY.md §3). Deterministas: ninguna llama a la
 * IA. Lo factual (promociones inventadas, claims, cifras, nombres propios) NUNCA produce una señal
 * de preferencia: corregirlo es integridad, no gusto.
 */

/** Peso de cada fuerza en el detector (las débiles nunca crean una candidata por sí solas). */
export const SIGNAL_WEIGHT: Record<CreativeSignalStrength, number> = { low: 1, medium: 2, high: 3 };

export function signal(
  dimension: CreativeMemoryDimension,
  subject: string,
  polarity: CreativeMemoryPolarity,
  action: CreativeSignalAction,
  strength: CreativeSignalStrength,
  value: string | null = null,
  previousValue: string | null = null,
): CreativeSignal {
  return CreativeSignalSchema.parse({
    dimension,
    subject,
    action,
    value: value?.slice(0, 200) ?? null,
    previousValue: previousValue?.slice(0, 200) ?? null,
    normalizedKey: memoryKey(dimension, subject, polarity),
    strength,
  });
}

export function formatSignal(
  format: ContentFormat | null | undefined,
  polarity: 'prefer' | 'avoid',
  action: CreativeSignalAction,
  strength: CreativeSignalStrength,
): CreativeSignal[] {
  if (!format || format === 'other') return [];
  return [signal('format', format, polarity, action, strength, format)];
}

export function platformSignal(
  platform: ContentPlatform | null | undefined,
  polarity: 'prefer' | 'avoid',
  action: CreativeSignalAction,
  strength: CreativeSignalStrength,
): CreativeSignal[] {
  if (!platform || platform === 'other') return [];
  return [signal('platform', platform, polarity, action, strength, platform)];
}

/** Cambiar el formato o la plataforma de una propuesta: evitar lo anterior, preferir lo nuevo. */
export function placementChangeSignals(
  before: { format: ContentFormat | null; platform: ContentPlatform | null },
  after: { format: ContentFormat | null; platform: ContentPlatform | null },
  strength: CreativeSignalStrength,
): CreativeSignal[] {
  const signals: CreativeSignal[] = [];
  if (before.format !== after.format) {
    signals.push(...formatSignal(before.format, 'avoid', 'replace', strength));
    signals.push(...formatSignal(after.format, 'prefer', 'replace', strength));
  }
  if (before.platform !== after.platform) {
    signals.push(...platformSignal(before.platform, 'avoid', 'replace', strength));
    signals.push(...platformSignal(after.platform, 'prefer', 'replace', strength));
  }
  return signals;
}

const URGENCY =
  /\b(?:compra(?:lo)? ya|ya mismo|ahora o nunca|ultimas unidades|no te lo pierdas|solo hoy|corre|apurate|date prisa|antes de que se acabe|por tiempo limitado)\b/;

const shouted = (text: string) =>
  (text.match(/(?<!\p{L})[A-ZÁÉÍÓÚÑ]{4,}(?!\p{L})/gu) ?? []).length > 0;

/** Clave de una edición de texto que las reglas no saben resumir (la resume el sintetizador). */
export const COPY_EDIT_KEY = 'communication:copy_edit:neutral';

/**
 * Edición de un texto propuesto por Pixel: lo que el usuario QUITÓ (urgencia, mayúsculas, un tema
 * del léxico) se evita; lo que AÑADIÓ se prefiere. Si no hay nada del léxico pero el texto cambió de
 * verdad, queda una señal genérica de edición para el sintetizador.
 */
export function textEditSignals(
  before: string,
  after: string,
  strength: CreativeSignalStrength,
): CreativeSignal[] {
  if (fold(before).trim() === fold(after).trim()) return [];
  const signals: CreativeSignal[] = [];
  if (URGENCY.test(fold(before)) && !URGENCY.test(fold(after))) {
    signals.push(signal('communication', 'urgency', 'avoid', 'replace', strength, after, before));
  }
  if (shouted(before) && !shouted(after)) {
    signals.push(signal('communication', 'shouting', 'avoid', 'replace', strength, after, before));
  }
  const removed = subjectsIn(before).filter(
    (s) => !subjectsIn(after).some((o) => o.subject === s.subject),
  );
  const added = subjectsIn(after).filter(
    (s) => !subjectsIn(before).some((o) => o.subject === s.subject),
  );
  for (const subject of removed) {
    if (subject.dimension === 'strategy' || subject.subject === 'max_priorities') continue;
    signals.push(signal(subject.dimension, subject.subject, 'avoid', 'replace', strength));
  }
  for (const subject of added) {
    if (subject.dimension === 'strategy' || subject.subject === 'max_priorities') continue;
    signals.push(signal(subject.dimension, subject.subject, 'prefer', 'replace', strength));
  }
  if (signals.length === 0) {
    signals.push(
      CreativeSignalSchema.parse({
        dimension: 'communication',
        subject: 'copy_edit',
        action: 'replace',
        value: after.slice(0, 200),
        previousValue: before.slice(0, 200),
        normalizedKey: COPY_EDIT_KEY,
        strength,
      }),
    );
  }
  return dedupe(signals);
}

/** Hallazgos factuales: overridearlos o corregirlos nunca es una preferencia creativa. */
const FACTUAL_CODES = new Set([
  'invented_promotion',
  'ungrounded_market_claim',
  'ungrounded_figure',
  'unknown_proper_name',
  'customer_assertion',
]);

/**
 * "Continuar de todas formas" sobre un hallazgo creativo: el usuario mantiene lo señalado. Señal
 * media (un override aislado nunca crea memoria; con otros puede proponer una candidata).
 */
export function guardianOverrideSignals(finding: {
  code: string;
  title: string;
  message: string;
  evidence: string[];
}): CreativeSignal[] {
  if (FACTUAL_CODES.has(finding.code)) return [];
  const text = [finding.title, finding.message, ...finding.evidence].join(' ');
  if (finding.code === 'aggressive_tone') {
    return /urgencia/.test(fold(finding.message))
      ? [signal('communication', 'urgency', 'prefer', 'override', 'medium')]
      : [signal('communication', 'shouting', 'prefer', 'override', 'medium')];
  }
  if (/^visual_|^brand_dislike$|^explicit_restriction$/.test(finding.code)) {
    return dedupe(
      subjectsIn(text)
        .filter((s) => s.dimension === 'visual' || s.dimension === 'communication')
        .map((s) => signal(s.dimension, s.subject, 'prefer', 'override', 'medium')),
    );
  }
  return [];
}

/** Corrección del Guardian aplicada: lo que el usuario aceptó quitar se evita (señal alta). */
export function guardianCorrectionSignals(kinds: string[]): CreativeSignal[] {
  const signals: CreativeSignal[] = [];
  if (kinds.includes('soften_urgency')) {
    signals.push(signal('communication', 'urgency', 'avoid', 'replace', 'high'));
  }
  if (kinds.includes('normalize_shouting')) {
    signals.push(signal('communication', 'shouting', 'avoid', 'replace', 'high'));
  }
  return signals;
}

export function dedupe(signals: CreativeSignal[]): CreativeSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (seen.has(s.normalizedKey)) return false;
    seen.add(s.normalizedKey);
    return true;
  });
}

/** Compacta un texto para before/after (nunca el recurso entero). */
export const compact = (field: string, value: string | null | undefined) =>
  value ? [{ field, value: value.slice(0, 300) }] : [];
