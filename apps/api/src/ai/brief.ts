import { z } from 'zod';

/*
 * Brief creativo: el contexto de marca (o, más abajo, el personal) en forma estructurada. Los
 * ContextBuilders lo incrustan en el system prompt entre etiquetas. Un modelo real lo lee como
 * referencia; el proveedor demo lo usa para componer respuestas sin IA.
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

/*
 * Brief personal: el contexto de UNA persona (PersonalDNA) para el Pixel Personal. Va entre
 * etiquetas <personal_context>, distintas de las de marca: un brief personal nunca se confunde con
 * uno de empresa.
 */

export const PERSONAL_BRIEF_TAG = 'personal_context';

export const PersonalBriefSchema = z.object({
  person: z.string(),
  professionalIdentity: z.array(z.string()),
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  strengths: z.array(z.string()),
  interests: z.array(z.string()),
  goals: z.object({
    professional: z.array(z.string()),
    personal: z.array(z.string()),
    content: z.array(z.string()),
    shortTerm: z.array(z.string()),
    longTerm: z.array(z.string()),
  }),
  audience: z.object({
    primary: z.string().nullable(),
    needs: z.array(z.string()),
    problems: z.array(z.string()),
    desiredPerception: z.array(z.string()),
  }),
  personality: z.array(z.string()),
  archetype: z.object({ id: z.string(), name: z.string(), stance: z.string() }).nullable(),
  tone: z.object({
    traits: z.array(z.string()),
    formality: z.number().int().min(1).max(5),
    energy: z.number().int().min(1).max(5),
    language: z.string(),
  }),
  vocabulary: z.object({ use: z.array(z.string()), avoid: z.array(z.string()) }),
  creative: z.object({
    styles: z.array(z.string()),
    colors: z.array(z.string()),
    references: z.array(z.string()),
    preferences: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  content: z.object({
    themes: z.array(z.string()),
    formats: z.array(z.string()),
    platforms: z.array(z.string()),
    frequency: z.string().nullable(),
  }),
  workStyle: z.object({
    times: z.array(z.string()),
    planning: z.array(z.string()),
    execution: z.array(z.string()),
    focus: z.array(z.string()),
    productivity: z.array(z.string()),
  }),
  wantsHelpWith: z.array(z.string()),
  expectations: z.string().nullable(),
  restrictions: z.array(z.string()),
  focus: z.array(z.string()),
  levers: z.array(CreativeLeverSchema),
  avatar: z
    .object({ name: z.string(), concept: z.string(), personality: z.array(z.string()) })
    .nullable(),
});
export type PersonalBrief = z.infer<typeof PersonalBriefSchema>;

export function renderPersonalBrief(brief: PersonalBrief): string {
  return `<${PERSONAL_BRIEF_TAG}>\n${JSON.stringify(brief)}\n</${PERSONAL_BRIEF_TAG}>`;
}

/** Recupera el brief personal incrustado en un system prompt (null si no hay o es inválido). */
export function extractPersonalBrief(system: string): PersonalBrief | null {
  const match = system.match(
    new RegExp(`<${PERSONAL_BRIEF_TAG}>\\n([\\s\\S]*?)\\n</${PERSONAL_BRIEF_TAG}>`),
  );
  if (!match?.[1]) return null;
  try {
    const parsed = PersonalBriefSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
