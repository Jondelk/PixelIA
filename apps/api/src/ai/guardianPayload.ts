import {
  GuardianDimensionSchema,
  GuardianModeSchema,
  GuardianResourceTypeSchema,
} from '@pixel/contracts';
import { z } from 'zod';
import { GuardianBrandProfileSchema } from './guardianLexicon.js';

/*
 * Contexto controlado del Brand Guardian para la IA (docs/BRAND-GUARDIAN.md §5). Solo viaja lo que
 * el evaluador necesita: un perfil compacto del ADN y referencias controladas (BRAND_*, CAMPAIGN_*,
 * RESOURCE_*) con su etiqueta y su texto. La IA solo puede citar esas referencias; el backend
 * descarta lo demás. Nunca documentos Mongo, ids ni otros workspaces.
 */

const RefSchema = z.object({ ref: z.string(), label: z.string(), text: z.string() });

export const GUARDIAN_EVALUATION_SCHEMA_NAME = 'guardian_semantic_evaluation';
export const GUARDIAN_CORRECTION_SCHEMA_NAME = 'guardian_correction';

export const GuardianPayloadSchema = z.object({
  brandName: z.string(),
  industry: z.string(),
  mode: GuardianModeSchema,
  resourceType: GuardianResourceTypeSchema,
  /** Dimensiones que piden criterio semántico. */
  dimensions: z.array(GuardianDimensionSchema),
  profile: GuardianBrandProfileSchema,
  brand: z.array(RefSchema),
  campaign: z.array(RefSchema),
  resource: z.array(RefSchema),
  /** Prompt 16: lo que Pixel ha aprendido (MEMORY_n): preferencias creativas, nunca hechos. */
  memory: z.array(RefSchema).default([]),
});
export type GuardianPayload = z.infer<typeof GuardianPayloadSchema>;

export const GUARDIAN_SYSTEM = `Eres el Brand Guardian de Pixel: revisas si una propuesta pertenece a ESTA marca.
Recibes el ADN y, si hay, la estrategia de campaña como referencias controladas, y los textos a revisar.

- Evalúa SOLO las dimensiones pedidas: identity (¿se siente como esta marca? ¿contradice su
  personalidad o introduce una identidad que no existe?), communication (tono, registro, cercanía),
  strategy (¿aprovecha el ADN o podría ser de cualquier marca?), campaign_alignment (¿desarrolla el
  concepto, los mensajes y los pilares?), content (encaje con la audiencia y el objetivo).
- Cada hallazgo cita evidenceRefs (RESOURCE_*) y brandRefs (BRAND_* o CAMPAIGN_*) que EXISTAN en la
  entrada. Explica qué encontraste, por qué importa y qué recomiendas. Nada de "no está alineado" sin más.
- No afirmes hechos que no puedes saber: ni rendimiento, ni métricas, ni lo que premia una red social.
- memory (MEMORY_n): preferencias y excepciones creativas que el usuario confirmó. Puedes citarlas en
  brandRefs como criterio creativo (comunicación, estilo, formato), NUNCA como prueba de un hecho.
- No revises cifras, promociones ni restricciones exactas: eso lo hace el backend con reglas.
- No inventes datos de la marca. Si todo encaja, devuelve findings vacío y un resumen por dimensión.`;

export function guardianPrompt(payload: GuardianPayload): string {
  return `Revisa con este contexto (JSON):\n<guardian_input>\n${JSON.stringify(payload)}\n</guardian_input>`;
}

export function extractGuardianPayload(prompt: string): GuardianPayload | null {
  const match = /<guardian_input>\s*([\s\S]*?)\s*<\/guardian_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = GuardianPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* ---------- Corrección (una sola pasada) ---------- */

export const GuardianCorrectionPayloadSchema = z.object({
  brandName: z.string(),
  profile: GuardianBrandProfileSchema,
  /** Rasgos reales que se pueden usar para no dejar un texto vacío (diferenciadores, esencia). */
  brandFacts: z.array(z.string()),
  texts: z.array(
    z.object({
      ref: z.string(),
      label: z.string(),
      text: z.string(),
      issues: z.array(
        z.object({
          kind: z.enum([
            'remove_phrase',
            'remove_claim',
            'normalize_shouting',
            'soften_urgency',
            'remove_proper_name',
          ]),
          match: z.string(),
        }),
      ),
    }),
  ),
});
export type GuardianCorrectionPayload = z.infer<typeof GuardianCorrectionPayloadSchema>;

export const GUARDIAN_CORRECTION_SYSTEM = `Corriges textos de una marca para resolver problemas concretos detectados por el Brand Guardian.
- Solo QUITA o SUAVIZA lo señalado (claims, promociones, cifras sin fuente, urgencia, mayúsculas).
- Nunca añadas cifras, promociones, precios, premios, nombres propios ni datos nuevos. Si una promoción
  no existe, se elimina: no se cambia por otra.
- Mantén el idioma, el sentido y el tono de la marca. Si el texto queda vacío, usa solo brandFacts.
- Devuelve el texto corregido de cada ref y una lista breve de cambios.`;

export function guardianCorrectionPrompt(payload: GuardianCorrectionPayload): string {
  return `Corrige con este contexto (JSON):\n<guardian_correction_input>\n${JSON.stringify(payload)}\n</guardian_correction_input>`;
}

export function extractGuardianCorrectionPayload(prompt: string): GuardianCorrectionPayload | null {
  const match = /<guardian_correction_input>\s*([\s\S]*?)\s*<\/guardian_correction_input>/.exec(
    prompt,
  );
  if (!match) return null;
  try {
    const parsed = GuardianCorrectionPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
