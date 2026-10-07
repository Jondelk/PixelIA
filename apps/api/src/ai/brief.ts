import { z } from 'zod';

/*
 * Brief creativo: el contexto de marca en forma estructurada. PixelContextBuilder lo incrusta
 * en el system prompt entre etiquetas <brand_context>. Un modelo real lo lee como referencia;
 * el proveedor demo lo usa para componer respuestas sin IA.
 */

export const BRIEF_TAG = 'brand_context';

export const CreativeLeverSchema = z.object({
  id: z.string(),
  /** Nombre corto de campaña / idea. */
  title: z.string(),
  /** Qué propone la palanca. */
  idea: z.string(),
  /** Cómo se demuestra en piezas concretas. */
  proof: z.string(),
});
export type CreativeLever = z.infer<typeof CreativeLeverSchema>;

export const CreativeBriefSchema = z.object({
  brand: z.string(),
  industry: z.string(),
  essence: z.string(),
  origin: z.string().nullable(),
  purpose: z.string(),
  values: z.array(z.string()),
  audience: z.object({
    summary: z.string(),
    needs: z.array(z.string()),
    problems: z.array(z.string()),
  }),
  personality: z.array(z.string()),
  archetype: z.object({ id: z.string(), name: z.string(), stance: z.string() }),
  tone: z.object({
    traits: z.array(z.string()),
    formality: z.number().int().min(1).max(5),
    energy: z.number().int().min(1).max(5),
    language: z.string(),
  }),
  vocabulary: z.object({ use: z.array(z.string()), avoid: z.array(z.string()) }),
  visual: z.object({
    styles: z.array(z.string()),
    materials: z.array(z.string()),
    recurring: z.array(z.string()),
    palette: z.array(z.string()),
    temperature: z.string(),
  }),
  differentiators: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  restrictions: z.array(z.string()),
  /** Temas detectados en la petición (social, launch, campaign…). */
  focus: z.array(z.string()),
  levers: z.array(CreativeLeverSchema),
  avatar: z
    .object({ name: z.string(), concept: z.string(), personality: z.array(z.string()) })
    .nullable(),
});
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export function renderBrief(brief: CreativeBrief): string {
  return `<${BRIEF_TAG}>\n${JSON.stringify(brief)}\n</${BRIEF_TAG}>`;
}

/** Recupera el brief incrustado en un system prompt (null si no hay o es inválido). */
export function extractBrief(system: string): CreativeBrief | null {
  const match = system.match(new RegExp(`<${BRIEF_TAG}>\\n([\\s\\S]*?)\\n</${BRIEF_TAG}>`));
  if (!match?.[1]) return null;
  try {
    const parsed = CreativeBriefSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
