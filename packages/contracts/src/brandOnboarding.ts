import { z } from 'zod';
import { HexColorSchema, level, list, optionalText, text } from './fields.js';

/*
 * Onboarding de marca ("Brand Brain"): lo que la empresa le enseña a Pixel, en 8 pasos.
 * Cada paso se valida completo al guardarse. El conjunto alimenta el BrandDNA.
 */

export const ONBOARDING_STEPS = [
  'company',
  'purpose',
  'audience',
  'personality',
  'communication',
  'visual',
  'competition',
  'creative',
] as const;
export const OnboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

// ---------- Sugerencias (el usuario puede elegirlas o escribir las suyas) ----------

export const PERSONALITY_SUGGESTIONS = [
  'innovadora',
  'tradicional',
  'elegante',
  'joven',
  'cercana',
  'artesanal',
  'tecnológica',
  'atrevida',
  'premium',
  'divertida',
  'minimalista',
  'confiable',
  'cálida',
  'experta',
  'sostenible',
  'sólida',
  'aventurera',
  'inspiradora',
] as const;

export const TONE_SUGGESTIONS = [
  'cálido',
  'cercano',
  'directo',
  'inspirador',
  'experto',
  'optimista',
  'sereno',
  'divertido',
  'sofisticado',
  'técnico',
  'empático',
  'audaz',
] as const;

export const VISUAL_STYLE_SUGGESTIONS = [
  'minimalista',
  'orgánico',
  'artesanal',
  'futurista',
  'industrial',
  'clásico',
  'editorial',
  'lúdico',
  'lujoso',
  'natural',
  'tecnológico',
  'brutalista',
] as const;

export const MATERIAL_SUGGESTIONS = [
  'madera',
  'papel kraft',
  'cerámica',
  'vidrio',
  'metal',
  'concreto',
  'tela',
  'cuero',
  'piedra',
  'plástico mate',
  'acero',
  'barro',
] as const;

export const SHAPE_SUGGESTIONS = [
  'orgánicas',
  'redondeadas',
  'geométricas',
  'angulares',
  'estructurales',
  'fluidas',
] as const;

/** Etiquetas de los niveles 1–5 de formalidad y energía (formulario y BrandDNA). */
export const FORMALITY_LEVELS = [
  'Muy informal',
  'Informal',
  'Equilibrada',
  'Formal',
  'Muy formal',
] as const;
export const ENERGY_LEVELS = [
  'Muy serena',
  'Serena',
  'Equilibrada',
  'Enérgica',
  'Muy enérgica',
] as const;

export const LANGUAGES = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  it: 'Italiano',
  de: 'Alemán',
} as const;
export const LanguageCodeSchema = z.enum(Object.keys(LANGUAGES) as [keyof typeof LANGUAGES]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

// ---------- Primitivas (compartidas con el onboarding personal: fields.ts) ----------

export { HexColorSchema } from './fields.js';

// ---------- Pasos ----------

export const CompanyStepSchema = z.object({
  name: text('Nombre', 2, 120),
  industry: text('Sector', 2, 80),
  description: text('Descripción', 10),
  history: text('Historia', 10),
  origin: optionalText(),
});

export const PurposeStepSchema = z.object({
  mission: text('Misión', 10),
  vision: text('Visión', 10),
  purpose: text('Propósito', 10),
  values: list('Valores', { min: 1, max: 8 }),
});

export const AudienceStepSchema = z.object({
  targetAudience: text('Público objetivo', 10),
  needs: list('Necesidades', { min: 1 }),
  problems: list('Problemas', { min: 1 }),
  characteristics: list('Características', { min: 1 }),
});

export const PersonalityStepSchema = z.object({
  attributes: list('Personalidad', { min: 3, max: 10 }),
});

export const CommunicationStepSchema = z.object({
  tone: list('Tono', { min: 1, max: 6 }),
  formality: level('formalidad'),
  energy: level('energía'),
  language: LanguageCodeSchema,
  wordsToUse: list('Palabras que utiliza', { max: 20 }),
  wordsToAvoid: list('Palabras o estilos a evitar', { max: 20 }),
});

export const BrandColorInputSchema = z.object({
  hex: HexColorSchema,
  name: optionalText(40),
});

export const VisualStepSchema = z.object({
  colors: z
    .array(BrandColorInputSchema)
    .min(1, 'Añade al menos un color')
    .max(8, 'Máximo 8 colores'),
  styles: list('Estilo visual', { min: 1, max: 8 }),
  materials: list('Materiales', { max: 10 }),
  shapes: list('Formas', { min: 1, max: 6 }),
  references: list('Referencias', { max: 10 }),
  recurringElements: list('Elementos recurrentes', { max: 10 }),
  avoid: list('Elementos a evitar', { max: 10 }),
});

export const CompetitionStepSchema = z.object({
  competitors: list('Competidores', { max: 10 }),
  differentiators: list('Diferenciadores', { min: 1, max: 8 }),
});

export const CreativeStepSchema = z.object({
  likes: list('Lo que le gusta', { min: 1 }),
  dislikes: list('Lo que no le gusta'),
  visualReferences: list('Referencias visuales', { max: 10 }),
  restrictions: list('Restricciones'),
});

export const ONBOARDING_STEP_SCHEMAS = {
  company: CompanyStepSchema,
  purpose: PurposeStepSchema,
  audience: AudienceStepSchema,
  personality: PersonalityStepSchema,
  communication: CommunicationStepSchema,
  visual: VisualStepSchema,
  competition: CompetitionStepSchema,
  creative: CreativeStepSchema,
} as const;

export type OnboardingStepData = {
  [K in OnboardingStep]: z.output<(typeof ONBOARDING_STEP_SCHEMAS)[K]>;
};
export type OnboardingStepInput = {
  [K in OnboardingStep]: z.input<(typeof ONBOARDING_STEP_SCHEMAS)[K]>;
};

/** Onboarding completo: los 8 pasos válidos. Es la entrada del generador de BrandDNA. */
export const BrandOnboardingSchema = z.object(ONBOARDING_STEP_SCHEMAS);
export type BrandOnboarding = z.infer<typeof BrandOnboardingSchema>;

/** Respuestas guardadas hasta ahora (cada paso, si existe, es válido). */
export const BrandOnboardingDraftSchema = BrandOnboardingSchema.partial();
export type BrandOnboardingDraft = z.infer<typeof BrandOnboardingDraftSchema>;

/** Cuerpo de PUT /api/companies/:companyId/brand-dna: guarda un paso. */
export const SaveOnboardingStepInputSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('company'), data: CompanyStepSchema }),
  z.object({ step: z.literal('purpose'), data: PurposeStepSchema }),
  z.object({ step: z.literal('audience'), data: AudienceStepSchema }),
  z.object({ step: z.literal('personality'), data: PersonalityStepSchema }),
  z.object({ step: z.literal('communication'), data: CommunicationStepSchema }),
  z.object({ step: z.literal('visual'), data: VisualStepSchema }),
  z.object({ step: z.literal('competition'), data: CompetitionStepSchema }),
  z.object({ step: z.literal('creative'), data: CreativeStepSchema }),
]);
export type SaveOnboardingStepInput = z.input<typeof SaveOnboardingStepInputSchema>;

export const OnboardingProgressSchema = z.object({
  answers: BrandOnboardingDraftSchema,
  completedSteps: z.array(OnboardingStepSchema),
  isComplete: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});
export type OnboardingProgress = z.infer<typeof OnboardingProgressSchema>;

/** Primer paso sin completar (o el último si ya están todos). */
export function nextOnboardingStep(completed: readonly OnboardingStep[]): OnboardingStep {
  return ONBOARDING_STEPS.find((step) => !completed.includes(step)) ?? 'creative';
}
