import { z } from 'zod';

/*
 * Pixel Action Foundation (Prompt 18, docs/PIXEL-ACTIONS.md): salida estructurada de un
 * planificador de IA que traduce una solicitud a acciones. La IA solo conoce referencias
 * controladas que le da el backend:
 * - CAPABILITY_n: una capacidad disponible en ESTE workspace (nunca el nombre de una herramienta);
 * - PROJECT_n, TASK_n…: recursos del contexto (nunca ids de Mongo).
 * El backend resuelve cada referencia; una desconocida (CAPABILITY_999, "send_whatsapp") se rechaza
 * y nada se ejecuta. La autorización NUNCA la decide la IA.
 */

export const GeneratedActionDraftSchema = z.object({
  /** CAPABILITY_n del catálogo recibido. Se valida contra él (no aquí): lo inventado se rechaza. */
  capabilityRef: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(300).nullable().default(null),
  /** Entrada de la capacidad; puede citar recursos del contexto por su referencia (PROJECT_1). */
  input: z.record(z.string(), z.unknown()).default({}),
  /** Posición (1, 2…) de una acción anterior de esta misma lista cuyo resultado usa. */
  dependsOn: z.number().int().min(1).max(20).nullable().default(null),
});
export type GeneratedActionDraft = z.infer<typeof GeneratedActionDraftSchema>;

export const GeneratedActionPlanSchema = z.object({
  /** answer: solo se responde (0 acciones); proposal: acciones a confirmar. */
  responseMode: z.enum(['answer', 'proposal']),
  explanation: z.string().trim().max(1000).nullable().default(null),
  actions: z.array(GeneratedActionDraftSchema).max(20).default([]),
});
export type GeneratedActionPlan = z.infer<typeof GeneratedActionPlanSchema>;
