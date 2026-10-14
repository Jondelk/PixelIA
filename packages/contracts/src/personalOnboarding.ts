import { z } from 'zod';
import { LanguageCodeSchema } from './brandOnboarding.js';
import { HexColorSchema, level, list, optionalText, text } from './fields.js';

/*
 * Onboarding personal: lo que una persona le enseña a su Pixel Personal, en 8 pasos.
 * Cada paso se valida completo al guardarse (guardado progresivo). El conjunto alimenta el
 * PersonalDNA. Casi todo es opcional: si falta algo, el ADN lo deja vacío (nunca se inventa).
 */

export const PERSONAL_ONBOARDING_STEPS = [
  'identity',
  'goals',
  'audience',
  'personality',
  'communication',
  'creative',
  'contentWork',
  'support',
] as const;
export const PersonalOnboardingStepSchema = z.enum(PERSONAL_ONBOARDING_STEPS);
export type PersonalOnboardingStep = z.infer<typeof PersonalOnboardingStepSchema>;

// ---------- Sugerencias (el usuario puede elegirlas o escribir las suyas) ----------

export const PERSONAL_TRAIT_SUGGESTIONS = [
  'creativo',
  'directo',
  'cercano',
  'experto',
  'técnico',
  'divertido',
  'inspirador',
  'curioso',
  'estratégico',
  'tranquilo',
  'atrevido',
  'minimalista',
  'disciplinado',
  'empático',
  'sofisticado',
] as const;

export const PERSONAL_TONE_SUGGESTIONS = [
  'cercano',
  'directo',
  'experto',
  'inspirador',
  'empático',
  'técnico',
  'sofisticado',
  'casual',
  'energético',
  'sereno',
] as const;

export const PERSONAL_STYLE_SUGGESTIONS = [
  'minimalista',
  'editorial',
  'tecnológico',
  'cinematográfico',
  'orgánico',
  'urbano',
  'elegante',
  'experimental',
  'artesanal',
  'futurista',
  'corporativo',
  'artístico',
] as const;

export const CONTENT_FORMAT_SUGGESTIONS = [
  'reels',
  'carruseles',
  'stories',
  'fotografía',
  'video largo',
  'podcast',
  'artículos',
  'newsletters',
] as const;

export const PLATFORM_SUGGESTIONS = [
  'Instagram',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'X',
  'Twitch',
  'Behance',
  'Pinterest',
  'Newsletter',
  'Blog',
] as const;

export const WORK_TIME_SUGGESTIONS = [
  'mañana temprano',
  'mañana',
  'tarde',
  'noche',
  'fines de semana',
] as const;

export const PLANNING_STYLE_SUGGESTIONS = [
  'lista diaria',
  'calendario',
  'prioridades',
  'planificación semanal',
] as const;

export const EXECUTION_STYLE_SUGGESTIONS = [
  'trabajo por bloques',
  'multitarea',
  'una cosa a la vez',
  'sprints cortos',
] as const;

export const FOCUS_STYLE_SUGGESTIONS = [
  'trabajo profundo',
  'sesiones cortas',
  'sesiones largas',
  'con música',
  'en silencio',
] as const;

export const PRODUCTIVITY_SUGGESTIONS = [
  'listas de tareas',
  'pomodoro',
  'revisión semanal',
  'un objetivo por día',
] as const;

export const HELP_SUGGESTIONS = [
  'contenido',
  'organización diaria',
  'proyectos',
  'clientes',
  'estudios',
  'marca personal',
  'ideas creativas',
  'planificación',
  'productividad',
  'seguimiento',
  'decisiones creativas',
] as const;

// ---------- Pasos ----------

/** Paso 1 — ¿Quién eres y a qué te dedicas? */
export const IdentityStepSchema = z.object({
  name: text('Nombre', 2, 80),
  profession: text('Profesión principal', 2, 120),
  headline: optionalText(160),
  bio: optionalText(1000),
  roles: list('Roles', { max: 8 }),
  skills: list('Habilidades', { max: 15 }),
  interests: list('Intereses', { max: 15 }),
  location: optionalText(120),
});

/** Paso 2 — ¿Qué quieres conseguir? */
export const GoalsStepSchema = z
  .object({
    professional: list('Objetivos profesionales', { max: 8 }),
    personal: list('Objetivos personales', { max: 8 }),
    content: list('Objetivos de contenido', { max: 8 }),
    shortTerm: list('Objetivos a corto plazo', { max: 8 }),
    longTerm: list('Objetivos a largo plazo', { max: 8 }),
  })
  .refine(
    (goals) => Object.values(goals).some((items) => items.length > 0),
    'Añade al menos un objetivo',
  );

/** Paso 3 — ¿A quién quieres llegar? */
export const PersonalAudienceStepSchema = z.object({
  primaryAudience: optionalText(300),
  secondaryAudiences: list('Públicos secundarios', { max: 8 }),
  needs: list('Qué necesita', { max: 10 }),
  problems: list('Qué problemas tiene', { max: 10 }),
  desiredPerception: list('Qué quieres que piense de ti', { max: 8 }),
});

/** Paso 4 — Personalidad. */
export const PersonalPersonalityStepSchema = z.object({
  traits: list('Personalidad', { min: 1, max: 10 }),
});

/** Paso 5 — Comunicación. */
export const PersonalCommunicationStepSchema = z.object({
  tone: list('Tono', { min: 1, max: 6 }),
  formality: level('formalidad'),
  energy: level('energía'),
  language: LanguageCodeSchema,
  preferredWords: list('Palabras frecuentes', { max: 20 }),
  avoidWords: list('Palabras a evitar', { max: 20 }),
});

export const PersonalColorInputSchema = z.object({
  hex: HexColorSchema,
  name: optionalText(40),
});

/** Paso 6 — Identidad creativa. */
export const PersonalCreativeStepSchema = z.object({
  styles: list('Estilos visuales', { max: 8 }),
  colors: z.array(PersonalColorInputSchema).max(8, 'Máximo 8 colores'),
  references: list('Referencias', { max: 10 }),
  visualPreferences: list('Preferencias visuales', { max: 10 }),
  avoidVisuals: list('Estilos a evitar', { max: 10 }),
});

/** Paso 7 — Contenido y forma de trabajar (dos bloques). */
export const ContentWorkStepSchema = z.object({
  content: z.object({
    themes: list('Temas', { max: 12 }),
    formats: list('Formatos', { max: 10 }),
    platforms: list('Plataformas', { max: 10 }),
    frequency: optionalText(80),
  }),
  work: z.object({
    preferredWorkTimes: list('Horario preferido', { max: 6 }),
    planningStyle: list('Forma de planificar', { max: 6 }),
    executionStyle: list('Forma de ejecutar', { max: 6 }),
    focusStyle: list('Forma de concentrarse', { max: 6 }),
    productivityPreferences: list('Preferencias de productividad', { max: 8 }),
  }),
});

/** Paso 8 — ¿Qué quieres que Pixel haga por ti? */
export const SupportStepSchema = z.object({
  wantsHelpWith: list('En qué te ayuda Pixel', { min: 1, max: 11 }),
  expectations: optionalText(1000),
});

export const PERSONAL_ONBOARDING_STEP_SCHEMAS = {
  identity: IdentityStepSchema,
  goals: GoalsStepSchema,
  audience: PersonalAudienceStepSchema,
  personality: PersonalPersonalityStepSchema,
  communication: PersonalCommunicationStepSchema,
  creative: PersonalCreativeStepSchema,
  contentWork: ContentWorkStepSchema,
  support: SupportStepSchema,
} as const;

export type PersonalOnboardingStepData = {
  [K in PersonalOnboardingStep]: z.output<(typeof PERSONAL_ONBOARDING_STEP_SCHEMAS)[K]>;
};
export type PersonalOnboardingStepInput = {
  [K in PersonalOnboardingStep]: z.input<(typeof PERSONAL_ONBOARDING_STEP_SCHEMAS)[K]>;
};

/** Onboarding completo: los 8 pasos válidos. Es la entrada del PersonalDnaGenerator. */
export const PersonalOnboardingSchema = z.object(PERSONAL_ONBOARDING_STEP_SCHEMAS);
export type PersonalOnboarding = z.infer<typeof PersonalOnboardingSchema>;
/** Alias del nombre conceptual (`generate(input: PersonalOnboardingInput)`). */
export type PersonalOnboardingInput = PersonalOnboarding;

/** Respuestas guardadas hasta ahora (borrador: cada paso, si existe, es válido). */
export const PersonalOnboardingDraftSchema = PersonalOnboardingSchema.partial();
export type PersonalOnboardingDraft = z.infer<typeof PersonalOnboardingDraftSchema>;

/** Cuerpo de PUT /api/workspaces/:workspaceId/personal-profile: guarda un paso. */
export const SavePersonalOnboardingStepInputSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('identity'), data: IdentityStepSchema }),
  z.object({ step: z.literal('goals'), data: GoalsStepSchema }),
  z.object({ step: z.literal('audience'), data: PersonalAudienceStepSchema }),
  z.object({ step: z.literal('personality'), data: PersonalPersonalityStepSchema }),
  z.object({ step: z.literal('communication'), data: PersonalCommunicationStepSchema }),
  z.object({ step: z.literal('creative'), data: PersonalCreativeStepSchema }),
  z.object({ step: z.literal('contentWork'), data: ContentWorkStepSchema }),
  z.object({ step: z.literal('support'), data: SupportStepSchema }),
]);
export type SavePersonalOnboardingStepInput = z.input<typeof SavePersonalOnboardingStepInputSchema>;

export const PersonalOnboardingProgressSchema = z.object({
  answers: PersonalOnboardingDraftSchema,
  completedSteps: z.array(PersonalOnboardingStepSchema),
  isComplete: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});
export type PersonalOnboardingProgress = z.infer<typeof PersonalOnboardingProgressSchema>;

/** Primer paso sin completar (o el último si ya están todos). */
export function nextPersonalOnboardingStep(
  completed: readonly PersonalOnboardingStep[],
): PersonalOnboardingStep {
  return PERSONAL_ONBOARDING_STEPS.find((step) => !completed.includes(step)) ?? 'support';
}
