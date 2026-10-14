import {
  EXTRACTION_FIELD_LABELS,
  ONBOARDING_STEP_SCHEMAS,
  ONBOARDING_STEPS,
  type OnboardingExtraction,
  type OnboardingStep,
} from '@pixel/contracts';
import type { StepForms } from './steps';

/*
 * Fusión pura de lo que Pixel extrajo de los documentos con el formulario del onboarding.
 *
 * Reglas (el usuario siempre manda):
 * - Un texto ya escrito nunca se reemplaza; solo se llenan los vacíos.
 * - En las listas se agregan los elementos nuevos (sin repetir) hasta el máximo del campo.
 * - Formalidad, energía e idioma tienen un valor por defecto: se ajustan solo si ese paso aún no
 *   se ha guardado.
 * Devuelve qué campos se llenaron por paso, para pedir al usuario que los revise.
 */

export type FilledFields = Record<OnboardingStep, string[]>;

/** Máximo de elementos de cada lista (los mismos del contrato del onboarding). */
const LIST_MAX: Record<string, number> = {
  'purpose.values': 8,
  'personality.attributes': 10,
  'communication.tone': 6,
  'communication.wordsToUse': 20,
  'communication.wordsToAvoid': 20,
  'visual.styles': 8,
  'visual.materials': 10,
  'visual.shapes': 6,
  'visual.references': 10,
  'visual.recurringElements': 10,
  'visual.avoid': 10,
  'visual.colors': 8,
  'competition.competitors': 10,
  'competition.differentiators': 8,
  'creative.visualReferences': 10,
};
const DEFAULT_LIST_MAX = 12;

const LEVEL_FIELDS = new Set(['formality', 'energy', 'language']);

export function emptyFilled(): FilledFields {
  return Object.fromEntries(ONBOARDING_STEPS.map((step) => [step, []])) as unknown as FilledFields;
}

function mergeList(current: string[], incoming: string[], max: number): string[] | null {
  const seen = new Set(current.map((item) => item.trim().toLocaleLowerCase('es')));
  const additions = incoming.filter((item) => {
    const key = item.trim().toLocaleLowerCase('es');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const room = Math.max(0, max - current.length);
  return additions.length && room ? [...current, ...additions.slice(0, room)] : null;
}

export function mergeExtraction(
  forms: StepForms,
  extraction: OnboardingExtraction,
  savedSteps: readonly OnboardingStep[],
): { forms: StepForms; filled: FilledFields } {
  const next = structuredClone(forms);
  const filled = emptyFilled();

  for (const step of ONBOARDING_STEPS) {
    const target = next[step] as Record<string, unknown>;
    const source = extraction[step] as Record<string, unknown>;
    for (const field of Object.keys(EXTRACTION_FIELD_LABELS[step])) {
      const incoming = source[field];
      const current = target[field];
      const path = `${step}.${field}`;

      if (field === 'colors') {
        const colors = current as { hex: string; name: string }[];
        const additions = (incoming as { hex: string; name: string | null }[]).filter(
          (color) => !colors.some((c) => c.hex.toUpperCase() === color.hex.toUpperCase()),
        );
        const room = Math.max(0, (LIST_MAX[path] ?? 8) - colors.length);
        if (additions.length && room) {
          target.colors = [
            ...colors,
            ...additions.slice(0, room).map((c) => ({ hex: c.hex, name: c.name ?? '' })),
          ];
          filled[step].push(field);
        }
      } else if (LEVEL_FIELDS.has(field)) {
        if (incoming !== null && incoming !== undefined && !savedSteps.includes(step)) {
          if (current !== incoming) {
            target[field] = incoming;
            filled[step].push(field);
          }
        }
      } else if (Array.isArray(current)) {
        const merged = mergeList(
          current as string[],
          (incoming as string[] | undefined) ?? [],
          LIST_MAX[path] ?? DEFAULT_LIST_MAX,
        );
        if (merged) {
          target[field] = merged;
          filled[step].push(field);
        }
      } else if (typeof incoming === 'string' && incoming.trim() && !String(current ?? '').trim()) {
        target[field] = incoming;
        filled[step].push(field);
      }
    }
  }
  return { forms: next, filled };
}

export interface MissingField {
  field: string;
  label: string;
  message: string;
}

/** Lo que aún falta en cada paso para poder guardarlo (según las reglas del onboarding). */
export function missingByStep(forms: StepForms): Record<OnboardingStep, MissingField[]> {
  const result = {} as Record<OnboardingStep, MissingField[]>;
  for (const step of ONBOARDING_STEPS) {
    const parsed = ONBOARDING_STEP_SCHEMAS[step].safeParse(forms[step]);
    const fields: MissingField[] = [];
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (!field || fields.some((f) => f.field === field)) continue;
        const labels = EXTRACTION_FIELD_LABELS[step] as Record<string, string>;
        fields.push({ field, label: labels[field] ?? field, message: issue.message });
      }
    }
    result[step] = fields;
  }
  return result;
}

/** Etiquetas legibles de los campos llenados en un paso. */
export function filledLabels(step: OnboardingStep, fields: string[]): string[] {
  const labels = EXTRACTION_FIELD_LABELS[step] as Record<string, string>;
  return fields.map((field) => labels[field] ?? field);
}

export function totalFilled(filled: FilledFields): number {
  return ONBOARDING_STEPS.reduce((sum, step) => sum + filled[step].length, 0);
}
