import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { HexColorSchema } from './brandOnboarding.js';

/*
 * AvatarProfile: cómo una identidad se transforma visualmente en Pixel. Es un concepto de
 * personaje, no un modelo 3D. Sale del BrandDNA de una empresa (sourceType = brand) o del
 * PersonalDNA de una persona (sourceType = personal), siempre con este mismo contrato.
 */

export const AvatarTypeSchema = z.enum([
  // Enterprise (BrandDNA)
  'anthropomorphic_object',
  'creature',
  'geometric_entity',
  'structural_character',
  'organic_character',
  // Compartido
  'abstract_character',
  // Personal (PersonalDNA)
  'stylized_human',
  'creative_companion',
  'tech_character',
  'object_inspired',
]);
export type AvatarType = z.infer<typeof AvatarTypeSchema>;

export const BodyShapeSchema = z.enum([
  'rounded',
  'oval',
  'teardrop',
  'faceted',
  'blocky',
  'capsule',
  'organic_irregular',
]);
export type BodyShape = z.infer<typeof BodyShapeSchema>;

export const FaceStyleSchema = z.enum([
  'friendly_minimal',
  'expressive_cartoon',
  'minimal_geometric',
  'visor',
  'sculpted',
]);
export const EyesStyleSchema = z.enum(['round', 'oval', 'dot', 'crescent', 'visor', 'line']);
export const MouthStyleSchema = z.enum([
  'soft_smile',
  'smile',
  'open_smile',
  'grin',
  'line',
  'none',
]);

export const AnimationPersonalitySchema = z.enum([
  'friendly_expressive',
  'calm_grounded',
  'precise_efficient',
  'playful_bouncy',
  'elegant_smooth',
  'bold_energetic',
  'wise_measured',
]);
export type AnimationPersonality = z.infer<typeof AnimationPersonalitySchema>;

export const IdleAnimationSchema = z.enum([
  'bounce',
  'float',
  'sway',
  'breathe',
  'hover_spin',
  'pulse',
]);
export type IdleAnimation = z.infer<typeof IdleAnimationSchema>;

/** Indicaciones para el renderer 3D (Etapa 7): primitivas paramétricas, sin generación de mallas. */
export const RenderArchetypeSchema = z.enum([
  'seed',
  'crystal',
  'block',
  'blob',
  'drop',
  'capsule',
]);
export const MaterialFinishSchema = z.enum([
  'matte',
  'satin',
  'glossy',
  'metallic',
  'clay',
  'glass',
]);
export const SurfaceDetailSchema = z.enum([
  'none',
  'center_groove',
  'facets',
  'panel_lines',
  'grain',
  'veins',
]);

export const AvatarColorSchema = z.object({
  hex: HexColorSchema,
  /** Nombre descriptivo, p. ej. "Tostado (marrón café)". */
  name: z.string(),
});

const Ratio = z.number().min(0.5).max(1.5);

/** Ruta del ADN (BrandDNA o PersonalDNA) que justifica una decisión, p. ej. "identity.industry". */
const DnaReference = z.string();

export const RationaleDecisionSchema = z.object({
  attribute: z.string(),
  value: z.string(),
  reason: z.string(),
  sources: z.array(DnaReference).min(1),
});

/** Contenido del concepto (lo que produce el motor). */
export const AvatarConceptSchema = z.object({
  /** Nombre conceptual del personaje. */
  name: z.string().min(1),
  avatarType: AvatarTypeSchema,
  /** Descripción del concepto en una o dos frases. */
  concept: z.string().min(1),
  baseObject: z.object({ id: z.string(), label: z.string() }),
  bodyShape: BodyShapeSchema,
  proportions: z.object({
    width: Ratio,
    height: Ratio,
    depth: Ratio,
    /** Tamaño relativo de la cabeza/rostro respecto al cuerpo (0.5–1.5). */
    faceScale: Ratio,
    stance: z.enum(['grounded', 'balanced', 'floating']),
  }),
  faceStyle: FaceStyleSchema,
  eyesStyle: EyesStyleSchema,
  mouthStyle: MouthStyleSchema,
  primaryColor: AvatarColorSchema,
  secondaryColor: AvatarColorSchema,
  accentColor: AvatarColorSchema,
  /** Materiales y acabados en palabras clave (p. ej. "grano tostado", "mate", "orgánico"). */
  materials: z.array(z.string()).min(1),
  accessories: z.array(z.string()),
  personalityTraits: z.array(z.string()).min(1),
  animationPersonality: AnimationPersonalitySchema,
  idleBehavior: z.object({
    animation: IdleAnimationSchema,
    energy: z.number().min(0).max(1),
    description: z.string(),
  }),
  speakingBehavior: z.object({
    pace: z.enum(['slow', 'moderate', 'lively']),
    gestures: z.array(z.string()),
    description: z.string(),
  }),
  /** 0–100: cuánto exagera expresiones y gestos. */
  expressiveness: z.number().int().min(0).max(100),
  visualKeywords: z.array(z.string()).min(1),
  avoid: z.array(z.string()),
  rationale: z.object({
    /** Por qué este personaje representa a la empresa. */
    summary: z.string().min(1),
    decisions: z.array(RationaleDecisionSchema).min(3),
  }),
  renderHints: z.object({
    archetype: RenderArchetypeSchema,
    roundness: z.number().min(0).max(1),
    finish: MaterialFinishSchema,
    surfaceDetail: SurfaceDetailSchema,
  }),
});
export type AvatarConcept = z.infer<typeof AvatarConceptSchema>;

export const AvatarEngineInfoSchema = z.object({
  kind: z.enum(['deterministic', 'ai']),
  version: z.string(),
  /** Variación usada al regenerar (0 = mejor ajuste al ADN). */
  variation: z.number().int().min(0),
});

/** De qué ADN sale el avatar: el de una marca (enterprise) o, próximamente, el PersonalDNA. */
export const AvatarSourceTypeSchema = z.enum(['brand', 'personal']);
export type AvatarSourceType = z.infer<typeof AvatarSourceTypeSchema>;

export const AvatarProfileSchema = AvatarConceptSchema.extend({
  id: ObjectIdSchema,
  /** Contexto principal: el workspace al que pertenece el avatar. */
  workspaceId: ObjectIdSchema,
  sourceType: AvatarSourceTypeSchema,
  /** Legacy/enterprise: empresa de origen (null en avatares personales). */
  companyId: ObjectIdSchema.nullable(),
  version: z.number().int().min(1),
  /** Versión del ADN del que salió: BrandDNA (brand) o PersonalDNA (personal); la otra es null. */
  brandDnaVersion: z.number().int().min(1).nullable(),
  personalDnaVersion: z.number().int().min(1).nullable(),
  engine: AvatarEngineInfoSchema,
  createdAt: IsoDateSchema,
});
export type AvatarProfile = z.infer<typeof AvatarProfileSchema>;

export const AvatarHistoryItemSchema = z.object({
  version: z.number().int().min(1),
  name: z.string(),
  baseObject: z.object({ id: z.string(), label: z.string() }),
  /** Versión del ADN de origen (de marca o personal). */
  dnaVersion: z.number().int().min(1),
  /** Legacy: igual a dnaVersion en avatares de marca; null en personales. */
  brandDnaVersion: z.number().int().min(1).nullable(),
  createdAt: IsoDateSchema,
});
export type AvatarHistoryItem = z.infer<typeof AvatarHistoryItemSchema>;

/** Respuesta de GET /avatar y POST /avatar/generate. */
export const AvatarResponseSchema = z.object({
  avatar: AvatarProfileSchema.nullable(),
  /** Versiones anteriores y actual, de la más reciente a la más antigua (máx. 20). */
  history: z.array(AvatarHistoryItemSchema),
  /** De qué ADN sale el avatar de este workspace. */
  sourceType: AvatarSourceTypeSchema,
  /** Versión vigente del ADN de origen; null si su onboarding no está completo. */
  dnaVersion: z.number().int().min(1).nullable(),
  /** Legacy/enterprise: versión vigente del BrandDNA (null en Personal). */
  brandDnaVersion: z.number().int().min(1).nullable(),
  /** true si el ADN cambió desde que se generó el avatar vigente. */
  isStale: z.boolean(),
});
export type AvatarResponse = z.infer<typeof AvatarResponseSchema>;

// ---------- Etiquetas para mostrar ----------

export const AVATAR_TYPE_LABELS: Record<AvatarType, string> = {
  anthropomorphic_object: 'Objeto antropomórfico',
  creature: 'Criatura',
  geometric_entity: 'Entidad geométrica',
  structural_character: 'Personaje estructural',
  organic_character: 'Personaje orgánico',
  abstract_character: 'Personaje abstracto',
  stylized_human: 'Humano estilizado',
  creative_companion: 'Compañero creativo',
  tech_character: 'Personaje tecnológico',
  object_inspired: 'Inspirado en un objeto',
};

export const ANIMATION_PERSONALITY_LABELS: Record<AnimationPersonality, string> = {
  friendly_expressive: 'Amigable y expresivo',
  calm_grounded: 'Sereno y con los pies en la tierra',
  precise_efficient: 'Preciso y eficiente',
  playful_bouncy: 'Juguetón y saltarín',
  elegant_smooth: 'Elegante y fluido',
  bold_energetic: 'Audaz y enérgico',
  wise_measured: 'Sabio y pausado',
};
