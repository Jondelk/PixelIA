import { ContentFormatSchema, ContentPlatformSchema } from '@pixel/contracts';
import { z } from 'zod';

/*
 * Contexto controlado que el ContentPlanningEngine envía al modelo (dentro de <planning_input>).
 * Solo lo necesario: nada de documentos Mongo, ni historial completo, ni proyectos archivados.
 * El proveedor demo lo lee para componer un plan con reglas en desarrollo y tests.
 */

const strings = z.array(z.string());

export const PlanningPayloadSchema = z.object({
  persona: z.object({
    name: z.string(),
    professionalIdentity: strings,
    summary: z.string().nullable(),
    interests: strings,
    roles: strings,
    skills: strings,
    strengths: strings,
    goals: z.object({
      professional: strings,
      personal: strings,
      content: strings,
      shortTerm: strings,
      longTerm: strings,
    }),
    audience: z.object({
      primaryAudience: z.string().nullable(),
      secondaryAudiences: strings,
      needs: strings,
      problems: strings,
      desiredPerception: strings,
    }),
    personality: z.object({ traits: strings, archetypes: strings }),
    communication: z.object({
      tone: strings,
      formality: z.number(),
      energy: z.number(),
      language: z.string(),
      preferredWords: strings,
      avoidWords: strings,
    }),
    creative: z.object({
      styles: strings,
      references: strings,
      visualPreferences: strings,
      avoidVisuals: strings,
    }),
    content: z.object({
      themes: strings,
      preferredFormats: strings,
      platforms: strings,
      frequencyPreference: z.string().nullable(),
    }),
    supportNeeds: z.object({ wantsHelpWith: strings, expectations: z.string().nullable() }),
    preferences: strings,
    restrictions: strings,
  }),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      type: z.string(),
      status: z.string(),
      goals: strings,
      dueDate: z.string().nullable(),
    }),
  ),
  recentContent: z.array(
    z.object({
      title: z.string(),
      hook: z.string().nullable(),
      platform: z.string().nullable(),
      format: z.string().nullable(),
      status: z.string(),
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
    goal: z.string().nullable(),
  }),
});
export type PlanningPayload = z.infer<typeof PlanningPayloadSchema>;

export const PLANNING_SCHEMA_NAME = 'content_plan';

export function planningPrompt(payload: PlanningPayload): string {
  return `Construye el plan de contenido con este contexto real (JSON):\n<planning_input>\n${JSON.stringify(payload)}\n</planning_input>`;
}

/** Lee el contexto de un prompt de planificación (null si no lo es o está corrupto). */
export function extractPlanningPayload(prompt: string): PlanningPayload | null {
  const match = /<planning_input>\s*([\s\S]*?)\s*<\/planning_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = PlanningPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
