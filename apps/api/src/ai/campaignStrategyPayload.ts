import { z } from 'zod';

/*
 * Contexto controlado que el CampaignStrategyEngine envía al modelo (dentro de <campaign_input>).
 * Solo lo necesario y acotado: el ADN de la marca, el brief y listas cortas (campañas recientes,
 * versiones anteriores, proyectos activos y contenido reciente) para no repetir. Nada de documentos
 * Mongo ni ids. El proveedor demo lo lee para componer una estrategia con reglas.
 */

const strings = z.array(z.string());

export const CampaignPayloadSchema = z.object({
  brand: z.object({
    name: z.string(),
    industry: z.string(),
    description: z.string(),
    story: z.string(),
    origin: z.string().nullable(),
    essence: z.string(),
    mission: z.string(),
    purpose: z.string(),
    values: strings,
    audience: z.object({
      summary: z.string(),
      needs: strings,
      problems: strings,
      characteristics: strings,
    }),
    personality: strings,
    archetype: z.object({ id: z.string(), name: z.string() }),
    communication: z.object({
      tone: strings,
      /** 1–5 */
      formality: z.number(),
      /** 1–5 */
      energy: z.number(),
      language: z.string(),
      preferredWords: strings,
      avoidWords: strings,
      do: strings,
      dont: strings,
    }),
    visual: z.object({
      palette: z.array(
        z.object({ name: z.string().nullable(), hex: z.string(), role: z.string() }),
      ),
      temperature: z.string(),
      styles: strings,
      materials: strings,
      shapes: strings,
      references: strings,
      recurringElements: strings,
    }),
    differentiators: strings,
    competitors: strings,
    likes: strings,
    dislikes: strings,
    visualReferences: strings,
    restrictions: z.object({ creative: strings, words: strings, visual: strings }),
  }),
  brief: z.object({
    objective: z.string(),
    campaignType: z.string().nullable(),
    productOrService: z.string().nullable(),
    description: z.string().nullable(),
    targetAudience: strings,
    problem: z.string().nullable(),
    desiredOutcome: z.string().nullable(),
    channels: strings,
    constraints: strings,
    mandatoryElements: strings,
    references: strings,
    period: z.object({ startDate: z.string().nullable(), endDate: z.string().nullable() }),
  }),
  /** Otras campañas recientes del workspace: no repetir concepto, nombre ni mensaje. */
  recentCampaigns: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      concept: z.string().nullable(),
      keyMessage: z.string().nullable(),
    }),
  ),
  /** Versiones anteriores de ESTA campaña (al regenerar): proponer algo distinto. */
  previousVersions: z.array(
    z.object({ bigIdea: z.string(), concept: z.string(), keyMessage: z.string() }),
  ),
  activeProjects: z.array(z.object({ name: z.string(), type: z.string(), status: z.string() })),
  recentContent: z.array(
    z.object({
      title: z.string(),
      platform: z.string().nullable(),
      format: z.string().nullable(),
    }),
  ),
});
export type CampaignPayload = z.infer<typeof CampaignPayloadSchema>;

export const CAMPAIGN_SCHEMA_NAME = 'campaign_strategy';

export function campaignPrompt(payload: CampaignPayload): string {
  return `Construye la estrategia de campaña con este contexto real (JSON):\n<campaign_input>\n${JSON.stringify(payload)}\n</campaign_input>`;
}

/** Lee el contexto de un prompt de campaña (null si no lo es o está corrupto). */
export function extractCampaignPayload(prompt: string): CampaignPayload | null {
  const match = /<campaign_input>\s*([\s\S]*?)\s*<\/campaign_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = CampaignPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
