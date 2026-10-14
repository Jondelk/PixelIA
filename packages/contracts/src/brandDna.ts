import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { HexColorSchema, LanguageCodeSchema, OnboardingProgressSchema } from './brandOnboarding.js';

/*
 * BrandDNA: lo que la empresa ES, en datos estructurados (no un bloque de texto).
 * Es la entrada de los demás motores (AvatarProfile, chat, criterio creativo).
 */

// ---------- Arquetipos de marca (12 arquetipos clásicos) ----------

export const BRAND_ARCHETYPES = {
  creator: {
    name: 'Creador',
    motto: 'Si se puede imaginar, se puede hacer.',
    description:
      'Valora la originalidad, el oficio y la expresión. Construye cosas con significado.',
  },
  caregiver: {
    name: 'Cuidador',
    motto: 'Ama a tu prójimo como a ti mismo.',
    description: 'Protege y acompaña. Genera confianza a través de la calidez y el servicio.',
  },
  explorer: {
    name: 'Explorador',
    motto: 'No me encierres.',
    description: 'Busca descubrir, recorrer y vivir experiencias auténticas y libres.',
  },
  sage: {
    name: 'Sabio',
    motto: 'La verdad te hará libre.',
    description: 'Aporta conocimiento, criterio y claridad. Comunica con precisión.',
  },
  hero: {
    name: 'Héroe',
    motto: 'Donde hay voluntad, hay un camino.',
    description: 'Supera retos con determinación y demuestra su valor con resultados.',
  },
  magician: {
    name: 'Mago',
    motto: 'Hago que las cosas sucedan.',
    description: 'Transforma la realidad. Convierte lo complejo en experiencias sorprendentes.',
  },
  rebel: {
    name: 'Rebelde',
    motto: 'Las reglas están para romperse.',
    description: 'Desafía lo establecido y propone caminos nuevos con audacia.',
  },
  lover: {
    name: 'Amante',
    motto: 'Solo tengo ojos para ti.',
    description: 'Celebra la belleza, el placer y los vínculos. Seduce con estética y detalle.',
  },
  jester: {
    name: 'Bufón',
    motto: 'Solo se vive una vez.',
    description: 'Aporta alegría, humor y ligereza. Hace que la marca sea memorable y divertida.',
  },
  everyman: {
    name: 'Persona común',
    motto: 'Todos somos iguales.',
    description: 'Cercana, honesta y sin pretensiones. Conecta desde lo cotidiano.',
  },
  ruler: {
    name: 'Gobernante',
    motto: 'El poder no lo es todo; es lo único.',
    description: 'Transmite solidez, control y excelencia. Lidera con estándares altos.',
  },
  innocent: {
    name: 'Inocente',
    motto: 'Libres para ser tú y yo.',
    description: 'Optimista, pura y sencilla. Transmite honestidad y bienestar.',
  },
} as const;

export type BrandArchetype = keyof typeof BRAND_ARCHETYPES;
export const BrandArchetypeSchema = z.enum(
  Object.keys(BRAND_ARCHETYPES) as [BrandArchetype, ...BrandArchetype[]],
);

const Score = z.number().min(0).max(100);
const Strings = z.array(z.string());

// ---------- Bloques ----------

export const IdentitySchema = z.object({
  name: z.string(),
  industry: z.string(),
  description: z.string(),
  story: z.string(),
  origin: z.string().nullable(),
  /** Una frase que resume lo que la marca es. */
  essence: z.string(),
});

export const PurposeSchema = z.object({
  mission: z.string(),
  vision: z.string(),
  purpose: z.string(),
  values: Strings,
});

export const AudienceSchema = z.object({
  summary: z.string(),
  needs: Strings,
  problems: Strings,
  characteristics: Strings,
});

export const PersonalityTraitSchema = z.object({
  label: z.string(),
  /** 0–1: relevancia según el orden en que la marca lo eligió. */
  weight: z.number().min(0).max(1),
  /** Si Pixel reconoce el rasgo (afecta arquetipo y dimensiones) o es propio de la marca. */
  recognized: z.boolean(),
});

/** Ejes de personalidad, 0–100 (50 = neutral). */
export const PersonalityDimensionsSchema = z.object({
  /** 0 tradicional ↔ 100 innovadora */
  innovation: Score,
  /** 0 accesible ↔ 100 sofisticada */
  sophistication: Score,
  /** 0 distante ↔ 100 cercana */
  warmth: Score,
  /** 0 seria ↔ 100 lúdica */
  playfulness: Score,
  /** 0 serena ↔ 100 enérgica */
  energy: Score,
});

export const PersonalitySchema = z.object({
  traits: z.array(PersonalityTraitSchema),
  dimensions: PersonalityDimensionsSchema,
});

export const ArchetypeMatchSchema = z.object({
  id: BrandArchetypeSchema,
  /** 0–100 relativo al arquetipo con mayor afinidad. */
  score: Score,
  /** Rasgos que llevaron a este arquetipo. */
  signals: Strings,
});

export const ArchetypesSchema = z.object({
  primary: ArchetypeMatchSchema,
  secondary: ArchetypeMatchSchema.nullable(),
  ranking: z.array(ArchetypeMatchSchema),
});

const LevelSchema = z.object({ level: z.number().int().min(1).max(5), label: z.string() });

export const CommunicationSchema = z.object({
  tone: Strings,
  formality: LevelSchema,
  energy: LevelSchema,
  language: z.object({ code: LanguageCodeSchema, name: z.string() }),
  vocabulary: z.object({ preferred: Strings, avoid: Strings }),
  /** Pautas derivadas para escribir como la marca. */
  guidelines: z.object({ do: Strings, dont: Strings }),
});

export const PaletteRoleSchema = z.enum(['primary', 'secondary', 'accent', 'neutral', 'support']);
export const ColorTemperatureSchema = z.enum(['warm', 'cool', 'neutral']);

export const PaletteColorSchema = z.object({
  hex: HexColorSchema,
  name: z.string().nullable(),
  role: PaletteRoleSchema,
  temperature: ColorTemperatureSchema,
  /** 0–1, luminancia relativa (WCAG). */
  luminance: z.number().min(0).max(1),
});

export const ShapeLanguageSchema = z.enum([
  'organic',
  'geometric',
  'structural',
  'fluid',
  'soft',
  'mixed',
]);

export const VisualLanguageSchema = z.object({
  palette: z.array(PaletteColorSchema),
  temperature: ColorTemperatureSchema,
  styles: Strings,
  materials: Strings,
  shapes: Strings,
  shapeLanguage: ShapeLanguageSchema,
  references: Strings,
  recurringElements: Strings,
});

export const DifferentiatorsSchema = z.object({
  statements: Strings,
  competitors: Strings,
});

export const CreativePreferencesSchema = z.object({
  likes: Strings,
  dislikes: Strings,
  visualReferences: Strings,
});

/** Todo lo que Pixel no debe hacer, consolidado desde varios pasos. */
export const RestrictionsSchema = z.object({
  creative: Strings,
  words: Strings,
  visual: Strings,
});

/** Contenido del ADN (lo que produce el generador). */
export const BrandDnaContentSchema = z.object({
  identity: IdentitySchema,
  purpose: PurposeSchema,
  audience: AudienceSchema,
  personality: PersonalitySchema,
  archetypes: ArchetypesSchema,
  communication: CommunicationSchema,
  visualLanguage: VisualLanguageSchema,
  differentiators: DifferentiatorsSchema,
  creativePreferences: CreativePreferencesSchema,
  restrictions: RestrictionsSchema,
});
export type BrandDnaContent = z.infer<typeof BrandDnaContentSchema>;

export const BrandDnaGeneratorSchema = z.object({
  /** 'deterministic' en esta fase; 'ai' cuando exista la capa de IA. */
  kind: z.enum(['deterministic', 'ai']),
  version: z.string(),
});

export const BrandDnaSchema = BrandDnaContentSchema.extend({
  id: ObjectIdSchema,
  companyId: ObjectIdSchema,
  version: z.number().int().min(1),
  generator: BrandDnaGeneratorSchema,
  createdAt: IsoDateSchema,
});
export type BrandDna = z.infer<typeof BrandDnaSchema>;

/** Respuesta de GET/PUT /api/companies/:companyId/brand-dna. */
export const BrandBrainResponseSchema = z.object({
  onboarding: OnboardingProgressSchema,
  brandDna: BrandDnaSchema.nullable(),
});
export type BrandBrainResponse = z.infer<typeof BrandBrainResponseSchema>;
