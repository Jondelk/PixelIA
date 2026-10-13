import { subjectOf, mentionsSubject } from '../creative-memory/memory.lexicon.js';
import type { ResolvedMemory } from '../creative-memory/memory.resolver.js';
import type { GuardianEvaluationInput, GuardianFindingDraft } from './guardian.types.js';

/*
 * Creative Memory en el Brand Guardian (Prompt 16, docs/BRAND-GUARDIAN.md §6 bis):
 *
 * - Las memorias son evidencia CREATIVA (MEMORY_n), nunca factual: no entran al vocabulario que
 *   fundamenta cifras, precios, promociones o claims, así que un "somos el #1" sigue bloqueado.
 * - Una EXCEPCIÓN explícita con alcance ("solo en la campaña X se permite neón") suspende, en ESE
 *   alcance, los avisos creativos sobre ese tema (restricción visual, choque de estilo, rechazo de la
 *   marca). Queda un hallazgo informativo que lo explica. Fuera de la campaña, todo sigue igual.
 * - Una preferencia aprendida que la pieza contradice (p. ej. una Story cuando se evitan) es un aviso
 *   leve y explicado, nunca un bloqueo: la solicitud de cada momento manda.
 */

export type GuardianMemory = ResolvedMemory;

/** Dimensiones de memoria útiles para revisar (nunca workflow: no es criterio de marca). */
export const GUARDIAN_MEMORY_DIMENSIONS = [
  'communication',
  'visual',
  'strategy',
  'content',
  'campaign',
  'format',
  'platform',
] as const;

/** Hallazgos creativos que una excepción explícita puede suspender (los factuales, jamás). */
const EXCEPTABLE =
  /^(?:visual_[a-z_]+_clash|visual_restriction|brand_dislike|explicit_restriction|identity_[a-z_]+)$/;

export function applyMemoriesToFindings(
  drafts: GuardianFindingDraft[],
  input: GuardianEvaluationInput,
): GuardianFindingDraft[] {
  const memories = input.memories ?? [];
  if (!memories.length) return drafts;
  const result: GuardianFindingDraft[] = [];
  const applied = new Map<string, GuardianMemory>();

  for (const draft of drafts) {
    const text = [
      draft.title,
      draft.message,
      ...draft.evidence,
      ...(draft.brandEvidence ?? []),
    ].join(' ');
    const exception = EXCEPTABLE.test(draft.code)
      ? memories.find((memory) => {
          if (memory.polarity !== 'allow' || memory.scopeType === 'workspace') return false;
          const subject = subjectOf(memory.dimension, memory.subject);
          return subject !== null && mentionsSubject(text, subject);
        })
      : undefined;
    if (exception) {
      applied.set(exception.ref, exception);
      continue;
    }
    result.push(draft);
  }

  for (const memory of applied.values()) {
    const label = subjectOf(memory.dimension, memory.subject)?.label ?? memory.subject;
    result.push({
      evaluator: 'restrictions',
      dimension: 'restrictions',
      severity: 'info',
      blocking: false,
      code: 'memory_exception_applied',
      title: `Excepción de ${memory.scopeLabel ? `«${memory.scopeLabel}»` : 'este alcance'}: se permite ${label}`,
      message: `El ADN lo restringe, pero indicaste explícitamente que ${memory.scopeLabel ? `en «${memory.scopeLabel}»` : 'aquí'} se permite. Fuera de ese alcance sigue valiendo la regla de la marca.`,
      evidence: [],
      brandRefs: [memory.ref],
      recommendation: null,
      canAutoFix: false,
      canOverride: false,
      fix: [],
      source: 'deterministic',
    });
  }

  // Preferencias aprendidas de formato o plataforma que una pieza contradice: aviso leve.
  for (const piece of input.resource.pieces) {
    const conflict = memories.find(
      (memory) =>
        memory.polarity === 'avoid' &&
        ((memory.dimension === 'format' && piece.format === memory.subject) ||
          (memory.dimension === 'platform' && piece.platform === memory.subject)),
    );
    if (!conflict) continue;
    result.push({
      evaluator: 'content',
      dimension: 'content',
      severity: 'low',
      blocking: false,
      code: 'memory_preference_conflict',
      title: `«${piece.label}» va contra lo que Pixel ha aprendido`,
      message: `Normalmente se prefiere: «${conflict.statement}». Si esta vez lo pediste así, puedes dejarlo: lo que pides ahora manda.`,
      evidence: [piece.label],
      brandRefs: [conflict.ref],
      recommendation: 'Cámbialo si no fue intencional; si lo es, continúa sin cambios.',
      canAutoFix: false,
      canOverride: true,
      fix: [],
      source: 'deterministic',
    });
  }
  return result;
}
