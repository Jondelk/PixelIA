import {
  GeneratedGuardianCorrectionSchema,
  type GeneratedGuardianCorrection,
  type GuardianCorrectionField,
} from '@pixel/contracts';
import {
  brandProfileOf,
  composeDemoGuardianCorrection,
  GUARDIAN_CORRECTION_SCHEMA_NAME,
  GUARDIAN_CORRECTION_SYSTEM,
  guardianCorrectionPrompt,
  type AIProvider,
  type GuardianCorrectionPayload,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import { buildVocabulary } from '../content-plans/contentPlanning.grounding.js';
import { groundingSources } from './guardian.engine.js';
import type {
  GuardianEvaluationInput,
  GuardianFixHint,
  GuardianResourceSnapshot,
} from './guardian.types.js';
import { classifyClaims } from './evaluators/index.js';

/*
 * GuardianCorrectionService (docs/BRAND-GUARDIAN.md §9). UNA pasada: toma los hallazgos con
 * `canAutoFix` y sus pistas, pide la corrección (IA, o reglas demo como respaldo) y la valida:
 * - solo textos que existen en la instantánea;
 * - nunca introduce afirmaciones nuevas: una cifra, promoción o claim que no estaba en el original
 *   invalida esa corrección (un "20 % de descuento" inventado se quita, no se cambia por "10 %").
 * No toca ningún recurso: devuelve la instantánea corregida para re-evaluarla una vez y, si el
 * usuario lo decide, aplicarla con el servicio del recurso.
 */

export interface CorrectionResult {
  snapshot: GuardianResourceSnapshot;
  fields: GuardianCorrectionField[];
  changes: string[];
}

export async function correctSnapshot(
  input: GuardianEvaluationInput,
  hints: GuardianFixHint[],
  deps: { ai: AIProvider; logger: Logger },
): Promise<CorrectionResult | null> {
  const byRef = new Map<string, GuardianFixHint[]>();
  for (const hint of hints) byRef.set(hint.ref, [...(byRef.get(hint.ref) ?? []), hint]);
  const texts = input.resource.texts.filter((text) => byRef.has(text.ref));
  if (!texts.length) return null;

  const payload: GuardianCorrectionPayload = {
    brandName: input.brandName,
    profile: brandProfileOf(input.brandDna),
    brandFacts: [
      ...input.brandDna.differentiators.statements,
      input.brandDna.identity.essence,
    ].filter(Boolean),
    texts: texts.map((text) => ({
      ref: text.ref,
      label: text.label,
      text: text.text,
      issues: (byRef.get(text.ref) ?? []).map((hint) => ({ kind: hint.kind, match: hint.match })),
    })),
  };
  let raw: GeneratedGuardianCorrection;
  try {
    const result = await deps.ai.generateStructuredOutput({
      system: GUARDIAN_CORRECTION_SYSTEM,
      prompt: guardianCorrectionPrompt(payload),
      schema: GeneratedGuardianCorrectionSchema,
      schemaName: GUARDIAN_CORRECTION_SCHEMA_NAME,
      maxOutputTokens: 3000,
      effort: 'low',
    });
    raw = GeneratedGuardianCorrectionSchema.parse(result.data);
  } catch (err) {
    deps.logger.warn('guardian_evaluation_failed', { stage: 'correction', err });
    raw = composeDemoGuardianCorrection(payload);
  }

  const vocabulary = buildVocabulary(groundingSources(input));
  const factual = (text: string) =>
    classifyClaims(text, vocabulary)
      .filter(
        (claim) => claim.kind === 'promotion' || claim.kind === 'market' || claim.kind === 'figure',
      )
      .map((claim) => claim.match);
  const fields: GuardianCorrectionField[] = [];
  const corrected = new Map<string, string>();
  for (const field of raw.fields) {
    const original = texts.find((text) => text.ref === field.ref);
    if (!original || field.corrected.trim() === original.text) continue;
    const before = new Set(factual(original.text));
    // Una corrección no puede añadir afirmaciones: se descarta entera.
    if (factual(field.corrected).some((claim) => !before.has(claim))) continue;
    corrected.set(field.ref, field.corrected.trim());
    fields.push({
      field: original.field ?? original.ref,
      label: original.label,
      original: original.text,
      corrected: field.corrected.trim(),
    });
  }
  if (!fields.length) return null;
  return {
    snapshot: {
      ...input.resource,
      texts: input.resource.texts.map((text) =>
        corrected.has(text.ref) ? { ...text, text: corrected.get(text.ref)! } : text,
      ),
    },
    fields,
    changes: raw.changes,
  };
}
