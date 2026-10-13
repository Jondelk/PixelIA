import { ContentFormatSchema, ContentPlatformSchema } from '@pixel/contracts';
import { z } from 'zod';

/*
 * Contexto controlado del Content Planner ENTERPRISE (dentro de <enterprise_planning_input>).
 * Jerarquía de fuentes: 1) BrandDNA, 2) estrategia vigente de la campaña, 3) su brief, 4) sus
 * piezas, 5) proyectos reales, 6) contenido reciente, 7) la petición. Sin ids de Mongo: las
 * referencias son CONTROLADAS (CAMPAIGN_1, DELIVERABLE_n, PROJECT_n, CONTENT_n) y el motor las
 * traduce después; una referencia desconocida se descarta. El proveedor demo lo lee para componer
 * un plan con reglas.
 */

const strings = z.array(z.string());

export const EnterprisePlanningPayloadSchema = z.object({
  brand: z.object({
    name: z.string(),
    industry: z.string(),
    description: z.string(),
    origin: z.string().nullable(),
    essence: z.string(),
    purpose: z.string(),
    values: strings,
    audience: z.object({ summary: z.string(), needs: strings, problems: strings }),
    personality: strings,
    archetype: z.object({ id: z.string(), name: z.string() }),
    communication: z.object({
      tone: strings,
      formality: z.number(),
      energy: z.number(),
      language: z.string(),
      preferredWords: strings,
      avoidWords: strings,
    }),
    visual: z.object({
      styles: strings,
      materials: strings,
      recurringElements: strings,
      palette: z.array(z.object({ name: z.string().nullable(), role: z.string() })),
    }),
    differentiators: strings,
    likes: strings,
    dislikes: strings,
    restrictions: z.object({ creative: strings, words: strings, visual: strings }),
  }),
  /** null = plan editorial de la marca sin campaña (no se finge ninguna). */
  campaign: z
    .object({
      ref: z.literal('CAMPAIGN_1'),
      name: z.string(),
      objective: z.string(),
      productOrService: z.string().nullable(),
      channels: strings,
      strategyVersion: z.number().int(),
      strategy: z.object({
        strategicProblem: z.string(),
        strategicOpportunity: z.string(),
        insight: z.string(),
        insightType: z.string(),
        bigIdea: z.string(),
        concept: z.string(),
        campaignNarrative: z.string(),
        keyMessage: z.string(),
        supportingMessages: strings,
        tone: strings,
        channels: strings,
        contentPillars: z.array(z.object({ name: z.string(), purpose: z.string() })),
        visualMood: strings,
        visualAvoid: strings,
      }),
    })
    .nullable(),
  /** Piezas de ESA campaña. `inProduction` = ya convertida: no proponer una copia pendiente. */
  deliverables: z.array(
    z.object({
      ref: z.string(),
      title: z.string(),
      type: z.string(),
      platform: z.string().nullable(),
      format: z.string().nullable(),
      objective: z.string().nullable(),
      inProduction: z.boolean(),
    }),
  ),
  projects: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      type: z.string(),
      status: z.string(),
      description: z.string().nullable(),
      goals: strings,
      /** Proyecto de la campaña elegida (sus proyectos van primero). */
      inCampaign: z.boolean(),
    }),
  ),
  recentContent: z.array(
    z.object({
      ref: z.string(),
      title: z.string(),
      hook: z.string().nullable(),
      platform: z.string().nullable(),
      format: z.string().nullable(),
    }),
  ),
  previousProposals: z.array(z.object({ title: z.string(), status: z.string() })),
  request: z.object({
    startDate: z.string(),
    endDate: z.string(),
    days: strings,
    itemCount: z.number().int().min(1),
    allowedPlatforms: z.array(ContentPlatformSchema).min(1),
    preferredFormats: z.array(ContentFormatSchema),
    /** Prompt 14.1: si no está vacío, SOLO estos formatos. */
    requiredFormats: z.array(ContentFormatSchema).optional(),
    /** Prompt 16: formatos que la memoria evita (la solicitud no los pidió). */
    avoidedFormats: z.array(ContentFormatSchema).default([]),
    /** Prompt 16: formatos que la memoria prefiere. */
    memoryPreferredFormats: z.array(ContentFormatSchema).default([]),
    goal: z.string().nullable(),
  }),
  /** Prompt 16: lo que Pixel ha aprendido (MEMORY_n). Preferencia por defecto, nunca un hecho. */
  creativeMemory: z.array(z.object({ ref: z.string(), statement: z.string() })).default([]),
});
export type EnterprisePlanningPayload = z.infer<typeof EnterprisePlanningPayloadSchema>;

export const ENTERPRISE_PLANNING_SCHEMA_NAME = 'enterprise_content_plan';

export function enterprisePlanningPrompt(payload: EnterprisePlanningPayload): string {
  return `Construye el plan editorial de la marca con este contexto real (JSON):\n<enterprise_planning_input>\n${JSON.stringify(payload)}\n</enterprise_planning_input>`;
}

/** Lee el contexto de un prompt de planificación Enterprise (null si no lo es o está corrupto). */
export function extractEnterprisePlanningPayload(prompt: string): EnterprisePlanningPayload | null {
  const match = /<enterprise_planning_input>\s*([\s\S]*?)\s*<\/enterprise_planning_input>/.exec(
    prompt,
  );
  if (!match) return null;
  try {
    const parsed = EnterprisePlanningPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
