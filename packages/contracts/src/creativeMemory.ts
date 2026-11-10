import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/*
 * Creative Memory (Prompt 16, docs/CREATIVE-MEMORY.md): lo que Pixel APRENDE de cómo decide de verdad
 * una persona o una marca, separado de lo que DECLARÓ que es (PersonalDNA / BrandDNA).
 *
 *   decisión humana → CreativeDecisionEvent (evidencia inmutable, con señales normalizadas)
 *                   → detector de patrones → memoria CANDIDATA (nunca activa sola)
 *                   → confirmación o instrucción explícita → memoria ACTIVA
 *                   → CreativeMemoryResolver → motores (PixelCommand, campañas, planners, Guardian…)
 *
 * "Creative Memory is decision memory, not conversation storage." Una sola acción aislada nunca
 * redefine la identidad de nadie, y una memoria nunca es un hecho: no fundamenta claims.
 */

/** Persistido desde el inicio: el tipo de workspace de la memoria (es su `contextType`). */
export const MemoryScopeSchema = z.enum(['enterprise', 'personal']);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const CREATIVE_MEMORY_DIMENSIONS = [
  'communication',
  'visual',
  'strategy',
  'content',
  'campaign',
  'workflow',
  'platform',
  'format',
  'other',
] as const;
export const CreativeMemoryDimensionSchema = z.enum(CREATIVE_MEMORY_DIMENSIONS);
export type CreativeMemoryDimension = z.infer<typeof CreativeMemoryDimensionSchema>;

/**
 * Tipos de memoria. Los tres últimos (`decision`, `insight`, `rejection`) son del modelo anterior al
 * Prompt 16: se conservan para no romper documentos guardados, pero ya no se crean.
 */
export const CreativeMemoryKindSchema = z.enum([
  'preference',
  'avoid',
  'approved_pattern',
  'rejected_pattern',
  'exception',
  'workflow_preference',
  'communication_preference',
  'visual_preference',
  'strategic_preference',
  'decision',
  'insight',
  'rejection',
]);
export type CreativeMemoryKind = z.infer<typeof CreativeMemoryKindSchema>;

/** `legacy` = memoria anterior al Prompt 16, sin clasificar: fuera del retrieval. */
export const CreativeMemoryStatusSchema = z.enum([
  'candidate',
  'active',
  'superseded',
  'dismissed',
  'forgotten',
  'legacy',
]);
export type CreativeMemoryStatus = z.infer<typeof CreativeMemoryStatusSchema>;

/** De dónde salió: lo dijo el usuario, lo detectó un patrón, una decisión del Guardian o de PixelCommand. */
export const CreativeMemoryOriginSchema = z.enum([
  'explicit',
  'decision_pattern',
  'guardian',
  'pixel_command',
  'legacy',
]);
export type CreativeMemoryOrigin = z.infer<typeof CreativeMemoryOriginSchema>;

/** `allow` = excepción explícita ("solo en esta campaña podemos usar neón"). */
export const CreativeMemoryPolaritySchema = z.enum(['prefer', 'avoid', 'allow', 'neutral']);
export type CreativeMemoryPolarity = z.infer<typeof CreativeMemoryPolaritySchema>;

export const CreativeMemoryScopeTypeSchema = z.enum([
  'workspace',
  'campaign',
  'project',
  'content_plan',
]);
export type CreativeMemoryScopeType = z.infer<typeof CreativeMemoryScopeTypeSchema>;

/** Más específico gana: plan > proyecto / campaña > workspace. */
export const CREATIVE_MEMORY_SCOPE_SPECIFICITY: Record<CreativeMemoryScopeType, number> = {
  content_plan: 3,
  project: 2,
  campaign: 2,
  workspace: 1,
};

export const CreativeMemoryScopeSchema = z.object({
  type: CreativeMemoryScopeTypeSchema,
  /** null solo en `workspace`. */
  id: ObjectIdSchema.nullable(),
  /** Nombre visible del recurso ("Cosecha 2026"); null en `workspace`. */
  label: z.string().nullable(),
});
export type CreativeMemoryScope = z.infer<typeof CreativeMemoryScopeSchema>;

/** Clave normalizada `dimension:subject:polarity` (p. ej. `format:story:avoid`). */
export const CREATIVE_MEMORY_KEY = /^[a-z_]+:[a-z0-9_]+:(?:prefer|avoid|allow|neutral)$/;
export const CreativeMemoryKeySchema = z.string().regex(CREATIVE_MEMORY_KEY, 'Clave inválida');

export const CREATIVE_MEMORY_MAX_EVIDENCE = 20;

export const CreativeMemorySchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  contextType: MemoryScopeSchema,
  kind: CreativeMemoryKindSchema,
  dimension: CreativeMemoryDimensionSchema,
  scope: CreativeMemoryScopeSchema,
  normalizedKey: z.string(),
  statement: z.string().min(1).max(1000),
  polarity: CreativeMemoryPolaritySchema,
  /** Valor del tema cuando lo tiene ("3" en "máximo 3 prioridades"). */
  value: z.string().nullable(),
  status: CreativeMemoryStatusSchema,
  origin: CreativeMemoryOriginSchema,
  /** Interno (0–1): no es una certeza; la UI no lo muestra como número. */
  confidence: z.number().min(0).max(1),
  occurrenceCount: z.number().int().min(0),
  evidenceCount: z.number().int().min(0),
  /** Candidatas: el patrón en lenguaje humano ("En 3 decisiones sobre 2 planes quitaste Stories"). */
  evidenceSummary: z.string().nullable(),
  confirmedByUser: z.boolean(),
  confirmedAt: IsoDateSchema.nullable(),
  supersedesMemoryId: ObjectIdSchema.nullable(),
  supersededByMemoryId: ObjectIdSchema.nullable(),
  forgottenAt: IsoDateSchema.nullable(),
  dismissedAt: IsoDateSchema.nullable(),
  lastObservedAt: IsoDateSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type CreativeMemory = z.infer<typeof CreativeMemorySchema>;

/* ---------- Decisiones (evidencia) ---------- */

export const CREATIVE_DECISION_EVENT_TYPES = [
  'guardian_override',
  'guardian_correction_applied',
  'pixel_command_adjusted',
  'explicit_memory_instruction',
  'campaign_deliverable_accepted',
  'campaign_deliverable_rejected',
  'content_plan_item_accepted',
  'content_plan_item_rejected',
  'content_plan_item_edited_then_accepted',
  'generated_content_edited_then_kept',
  'creative_resource_rejected',
  'memory_candidate_confirmed',
  'memory_candidate_dismissed',
] as const;
export const CreativeDecisionEventTypeSchema = z.enum(CREATIVE_DECISION_EVENT_TYPES);
export type CreativeDecisionEventType = z.infer<typeof CreativeDecisionEventTypeSchema>;

export const CreativeSignalActionSchema = z.enum([
  'prefer',
  'avoid',
  'replace',
  'approve',
  'reject',
  'override',
]);
export type CreativeSignalAction = z.infer<typeof CreativeSignalActionSchema>;

export const CreativeSignalStrengthSchema = z.enum(['low', 'medium', 'high']);
export type CreativeSignalStrength = z.infer<typeof CreativeSignalStrengthSchema>;

/** Señal normalizada de una decisión. `normalizedKey` agrupa decisiones equivalentes. */
export const CreativeSignalSchema = z.object({
  dimension: CreativeMemoryDimensionSchema,
  subject: z.string().regex(/^[a-z0-9_]+$/),
  action: CreativeSignalActionSchema,
  value: z.string().max(200).nullable(),
  previousValue: z.string().max(200).nullable(),
  normalizedKey: CreativeMemoryKeySchema,
  strength: CreativeSignalStrengthSchema,
});
export type CreativeSignal = z.infer<typeof CreativeSignalSchema>;

/** Solo lo relevante de la decisión ("CTA: ¡Compra YA!"), nunca el recurso entero. */
export const CompactDecisionSnapshotSchema = z.array(
  z.object({ field: z.string().max(60), value: z.string().max(300) }),
);
export type CompactDecisionSnapshot = z.infer<typeof CompactDecisionSnapshotSchema>;

/** Evidencia que la UI muestra en "¿Por qué Pixel piensa esto?" (sin ids). */
export const CreativeMemoryEvidenceSchema = z.object({
  description: z.string(),
  occurredAt: IsoDateSchema,
});
export type CreativeMemoryEvidence = z.infer<typeof CreativeMemoryEvidenceSchema>;

/* ---------- API ---------- */

export const CreativeMemoryListQuerySchema = z.object({
  /** `history` = superseded, dismissed y forgotten. */
  view: z.enum(['active', 'candidate', 'history', 'all']).default('all'),
});
export type CreativeMemoryListQuery = z.output<typeof CreativeMemoryListQuerySchema>;

export const CreativeMemoryListResponseSchema = z.object({
  memories: z.array(CreativeMemorySchema),
});
export type CreativeMemoryListResponse = z.infer<typeof CreativeMemoryListResponseSchema>;

export const CreativeMemoryResponseSchema = z.object({
  memory: CreativeMemorySchema,
  evidence: z.array(CreativeMemoryEvidenceSchema),
  /** Memoria que esta reemplazó o por la que fue reemplazada (para el historial). */
  related: z.array(CreativeMemorySchema),
});
export type CreativeMemoryResponse = z.infer<typeof CreativeMemoryResponseSchema>;

const memoryText = z
  .string()
  .trim()
  .min(3, 'Cuéntale a Pixel qué debe recordar')
  .max(500, 'Máximo 500 caracteres');

const ScopeInputSchema = z
  .object({
    type: CreativeMemoryScopeTypeSchema,
    id: ObjectIdSchema.optional(),
  })
  .strict()
  .refine((scope) => (scope.type === 'workspace') === (scope.id === undefined), {
    message: 'Un alcance que no es el workspace necesita su recurso',
  });

/** POST …/creative-memories/remember — el clic es la confirmación (la vía principal es hablar con Pixel). */
export const RememberCreativeMemorySchema = z
  .object({
    text: memoryText,
    scope: ScopeInputSchema.default({ type: 'workspace' }),
  })
  .strict();
export type RememberCreativeMemoryInput = z.input<typeof RememberCreativeMemorySchema>;
export type RememberCreativeMemoryData = z.output<typeof RememberCreativeMemorySchema>;

/** POST …/:memoryId/replace — editar = nueva memoria; la anterior queda superseded. */
export const ReplaceCreativeMemorySchema = z.object({ text: memoryText }).strict();
export type ReplaceCreativeMemoryInput = z.input<typeof ReplaceCreativeMemorySchema>;

export const CreativeMemoryActionResponseSchema = z.object({ memory: CreativeMemorySchema });
export type CreativeMemoryActionResponse = z.infer<typeof CreativeMemoryActionResponseSchema>;

/* ---------- Salida estructurada del sintetizador (IA) ---------- */

/**
 * El sintetizador solo ve EVENT_1…EVENT_n (nunca ids). Una referencia desconocida se descarta; sin
 * evidencia válida, o sin respaldo en los eventos, no se crea nada.
 */
export const GeneratedCreativeMemorySynthesisSchema = z.object({
  shouldCreateCandidate: z.boolean(),
  kind: CreativeMemoryKindSchema.optional(),
  dimension: CreativeMemoryDimensionSchema.optional(),
  normalizedKey: z.string().max(80).optional(),
  statement: z.string().trim().min(3).max(200).optional(),
  evidenceRefs: z
    .array(z.string().regex(/^EVENT_\d{1,3}$/))
    .max(20)
    .default([]),
  confidence: z.number().min(0).max(1).optional(),
});
export type GeneratedCreativeMemorySynthesis = z.infer<
  typeof GeneratedCreativeMemorySynthesisSchema
>;

/* ---------- Etiquetas (UI en español) ---------- */

export const CREATIVE_MEMORY_DIMENSION_LABELS: Record<CreativeMemoryDimension, string> = {
  communication: 'Comunicación',
  visual: 'Visual',
  strategy: 'Estrategia',
  content: 'Contenido',
  campaign: 'Campañas',
  workflow: 'Forma de trabajar',
  platform: 'Plataformas',
  format: 'Formatos',
  other: 'Otros',
};

export const CREATIVE_MEMORY_ORIGIN_LABELS: Record<CreativeMemoryOrigin, string> = {
  explicit: 'Indicado explícitamente por ti',
  decision_pattern: 'Aprendido de tus decisiones (confirmado por ti)',
  guardian: 'Aprendido de tus decisiones en Brand Guardian',
  pixel_command: 'Aprendido de tus ajustes a las propuestas de Pixel',
  legacy: 'Memoria anterior',
};
