import { z } from 'zod';

/*
 * Contexto controlado del CreativeMemorySynthesizer (dentro de <memory_input>). Solo se usa con
 * evidencia suficiente (≥ 3 decisiones independientes en ≥ 2 recursos) que las reglas no saben
 * resumir. Los eventos llegan como EVENT_1…EVENT_n con su antes/después compacto: nunca ids, fechas
 * ni puntuaciones internas. El proveedor demo lo lee para componer la síntesis con reglas.
 */

export const MemoryPayloadSchema = z.object({
  contextType: z.enum(['personal', 'enterprise']),
  events: z
    .array(
      z.object({
        ref: z.string(),
        description: z.string(),
        before: z.array(z.object({ field: z.string(), value: z.string() })),
        after: z.array(z.object({ field: z.string(), value: z.string() })),
      }),
    )
    .min(1)
    .max(20),
});
export type MemoryPayload = z.infer<typeof MemoryPayloadSchema>;

export const MEMORY_SYNTHESIS_SCHEMA_NAME = 'creative_memory_synthesis';

export const MEMORY_SYSTEM = `Eres el módulo de memoria creativa de Pixel, un director creativo. Recibes decisiones REALES
que tomó una persona o una marca sobre propuestas de Pixel (qué cambió, quitó o mantuvo). Tu única
tarea: decidir si juntas muestran un patrón creativo recurrente y, si es así, enunciarlo.

Reglas:
- Solo patrones creativos o de forma de trabajar: comunicación, formatos, plataformas, estilo visual,
  tipo de contenido, flujo de trabajo. NUNCA hechos (precios, cifras, clientes, certificaciones,
  liderazgo de mercado, claims legales): eso no es una preferencia.
- Personal: NUNCA infieras salud, sexualidad, religión, política, etnia, finanzas, antecedentes ni
  credenciales.
- El enunciado debe estar sustentado por los eventos: si quitaron Stories, no digas que prefieren
  TikTok. Si no hay un patrón claro y común a la mayoría de eventos, shouldCreateCandidate = false.
- Enunciado específico y accionable, en español ("Suele preferir CTA suaves en contenido orgánico"),
  nunca absoluto ni vago ("Le gusta lo elegante", "Es una persona creativa").
- evidenceRefs: SOLO referencias EVENT_n que recibiste y que sostienen el patrón.
- normalizedKey: "dimension:tema:polaridad" en minúsculas, polaridad prefer o avoid.`;

export function memoryPrompt(payload: MemoryPayload): string {
  return `Analiza estas decisiones reales (JSON):\n<memory_input>\n${JSON.stringify(payload)}\n</memory_input>`;
}

export function extractMemoryPayload(prompt: string): MemoryPayload | null {
  const match = /<memory_input>\s*([\s\S]*?)\s*<\/memory_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = MemoryPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
