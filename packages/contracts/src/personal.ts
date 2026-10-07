import { z } from 'zod';
import { BRAND_ARCHETYPES, BrandArchetypeSchema } from './brandDna.js';
import { LanguageCodeSchema } from './brandOnboarding.js';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { HexColorSchema } from './fields.js';
import { PersonalOnboardingProgressSchema } from './personalOnboarding.js';

/*
 * Pixel Personal (docs/PERSONAL.md):
 *   Workspace (type: personal) → PersonalProfile → PersonalDNA
 * PersonalDNA es una entidad propia (no reutiliza BrandDNA): lo que la persona ES y cómo trabaja,
 * estructurado a partir de su onboarding. Nunca inventa datos: lo que falta queda vacío.
 */

// ---------- PersonalProfile ----------

export const PersonalProfileSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  userId: ObjectIdSchema,
  name: z.string(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  profession: z.string().nullable(),
  roles: z.array(z.string()),
  skills: z.array(z.string()),
  interests: z.array(z.string()),
  location: z.string().nullable(),
  /** Versión vigente del PersonalDNA; null hasta completar el onboarding. */
  personalDnaVersion: z.number().int().min(1).nullable(),
  /** Versión vigente del avatar personal; null si aún no se creó. */
  avatarVersion: z.number().int().min(1).nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type PersonalProfile = z.infer<typeof PersonalProfileSchema>;

/** GET/PUT /api/workspaces/:workspaceId/personal-profile. */
export const PersonalProfileResponseSchema = z.object({
  /** null hasta guardar el primer paso del onboarding. */
  profile: PersonalProfileSchema.nullable(),
  onboarding: PersonalOnboardingProgressSchema,
});
export type PersonalProfileResponse = z.infer<typeof PersonalProfileResponseSchema>;

// ---------- PersonalDNA ----------

const strings = z.array(z.string());

export const PersonalColorSchema = z.object({ hex: HexColorSchema, name: z.string().nullable() });

export const PersonalDnaContentSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    /** Profesión y roles con los que se presenta. */
    professionalIdentity: strings,
    summary: z.string().nullable(),
    /** Intereses declarados (alimentan el avatar y el criterio creativo). */
    interests: strings.default([]),
  }),
  professionalProfile: z.object({
    roles: strings,
    skills: strings,
    industries: strings,
    strengths: strings,
  }),
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
  personality: z.object({
    traits: strings,
    /** Arquetipos inferidos SOLO de los rasgos elegidos (mapa determinístico o IA con enum cerrado). */
    archetypes: z.array(BrandArchetypeSchema),
  }),
  communication: z.object({
    tone: strings,
    formality: z.number().int().min(1).max(5),
    energy: z.number().int().min(1).max(5),
    language: LanguageCodeSchema,
    preferredWords: strings,
    avoidWords: strings,
  }),
  creativeIdentity: z.object({
    styles: strings,
    colors: z.array(PersonalColorSchema),
    references: strings,
    visualPreferences: strings,
    avoidVisuals: strings,
  }),
  contentIdentity: z.object({
    themes: strings,
    preferredFormats: strings,
    platforms: strings,
    frequencyPreference: z.string().nullable(),
  }),
  workStyle: z.object({
    preferredWorkTimes: strings,
    planningStyle: strings,
    executionStyle: strings,
    focusStyle: strings,
    productivityPreferences: strings,
  }),
  supportNeeds: z.object({
    wantsHelpWith: strings,
    /** "¿Qué esperas de tu Pixel Personal?" con las palabras de la persona. */
    expectations: z.string().nullable(),
  }),
  preferences: strings,
  restrictions: strings,
});
export type PersonalDnaContent = z.infer<typeof PersonalDnaContentSchema>;

export const PersonalDnaGeneratorSchema = z.object({
  /** deterministic = reglas; ai = reglas + enriquecimiento IA validado; manual = editado a mano. */
  kind: z.enum(['deterministic', 'ai', 'manual']),
  version: z.string(),
});

export const PersonalDnaSchema = PersonalDnaContentSchema.extend({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  personalProfileId: ObjectIdSchema,
  version: z.number().int().min(1),
  generator: PersonalDnaGeneratorSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type PersonalDna = z.infer<typeof PersonalDnaSchema>;
export type PersonalDNA = PersonalDna;

/** PUT /api/workspaces/:workspaceId/personal-dna: corrige secciones del ADN (crea una versión). */
export const UpdatePersonalDnaSchema = PersonalDnaContentSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos una sección para actualizar');
export type UpdatePersonalDnaInput = z.infer<typeof UpdatePersonalDnaSchema>;

export const PersonalDnaCompletenessSchema = z.object({
  percent: z.number().int().min(0).max(100),
  filled: z.number().int().min(0),
  total: z.number().int().min(1),
  /** Secciones vacías, con su etiqueta para la UI. */
  missing: z.array(z.string()),
});
export type PersonalDnaCompleteness = z.infer<typeof PersonalDnaCompletenessSchema>;

/** GET/PUT /api/workspaces/:workspaceId/personal-dna y POST …/personal-dna/generate. */
export const PersonalDnaResponseSchema = z.object({
  personalDna: PersonalDnaSchema.nullable(),
  completeness: PersonalDnaCompletenessSchema.nullable(),
});
export type PersonalDnaResponse = z.infer<typeof PersonalDnaResponseSchema>;

const COMPLETENESS_CHECKS: [string, (dna: PersonalDnaContent) => boolean][] = [
  ['Resumen personal', (dna) => Boolean(dna.identity.summary)],
  ['Roles', (dna) => dna.professionalProfile.roles.length > 0],
  ['Habilidades', (dna) => dna.professionalProfile.skills.length > 0],
  ['Objetivos', (dna) => Object.values(dna.goals).some((items) => items.length > 0)],
  ['Audiencia', (dna) => Boolean(dna.audience.primaryAudience) || dna.audience.needs.length > 0],
  ['Personalidad', (dna) => dna.personality.traits.length > 0],
  ['Tono', (dna) => dna.communication.tone.length > 0],
  ['Estilo creativo', (dna) => dna.creativeIdentity.styles.length > 0],
  [
    'Contenido',
    (dna) =>
      dna.contentIdentity.themes.length > 0 || dna.contentIdentity.preferredFormats.length > 0,
  ],
  ['Forma de trabajar', (dna) => Object.values(dna.workStyle).some((items) => items.length > 0)],
  ['Ayuda que esperas', (dna) => dna.supportNeeds.wantsHelpWith.length > 0],
];

/** Qué parte del ADN personal tiene información (para el estado de completitud). */
export function personalDnaCompleteness(dna: PersonalDnaContent): PersonalDnaCompleteness {
  const missing = COMPLETENESS_CHECKS.filter(([, check]) => !check(dna)).map(([label]) => label);
  const total = COMPLETENESS_CHECKS.length;
  const filled = total - missing.length;
  return { percent: Math.round((filled / total) * 100), filled, total, missing };
}

/** Nombre de los arquetipos para mostrar (mismos 12 que en marca). */
export function archetypeName(id: z.infer<typeof BrandArchetypeSchema>): string {
  return BRAND_ARCHETYPES[id].name;
}
