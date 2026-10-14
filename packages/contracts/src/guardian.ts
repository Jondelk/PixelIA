import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/*
 * Brand Guardian (Prompt 15, docs/BRAND-GUARDIAN.md): el control creativo de Pixel Enterprise.
 * Revisa una propuesta, campaña, plan, pieza o texto contra el BrandDNA (y la estrategia de campaña
 * si aplica) y devuelve un informe EXPLICABLE: dimensiones, hallazgos con evidencia y
 * recomendación, y un score heurístico que el backend calcula con penalizaciones documentadas.
 * El score no es una medida científica: resume las reglas y evaluadores aplicados.
 */

export const GUARDIAN_MODES = [
  'preflight',
  'campaign',
  'content_plan',
  'content',
  'copy',
  'structured_visual_direction',
] as const;
export const GuardianModeSchema = z.enum(GUARDIAN_MODES);
export type GuardianMode = z.infer<typeof GuardianModeSchema>;

export const GUARDIAN_RESOURCE_TYPES = [
  'pixel_proposal',
  'campaign',
  'campaign_strategy',
  'content_plan',
  'content_plan_item',
  'content_item',
  'copy',
] as const;
export const GuardianResourceTypeSchema = z.enum(GUARDIAN_RESOURCE_TYPES);
export type GuardianResourceType = z.infer<typeof GuardianResourceTypeSchema>;

/** Modo por defecto de cada recurso (el mismo motor sirve para todos). */
export const GUARDIAN_DEFAULT_MODE: Record<GuardianResourceType, GuardianMode> = {
  pixel_proposal: 'preflight',
  campaign: 'campaign',
  campaign_strategy: 'campaign',
  content_plan: 'content_plan',
  content_plan_item: 'content',
  content_item: 'content',
  copy: 'copy',
};

export const GUARDIAN_DIMENSIONS = [
  'identity',
  'communication',
  'claims',
  'restrictions',
  'strategy',
  'campaign_alignment',
  'content',
  'visual_direction',
] as const;
export const GuardianDimensionSchema = z.enum(GUARDIAN_DIMENSIONS);
export type GuardianDimension = z.infer<typeof GuardianDimensionSchema>;

export const GuardianSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type GuardianSeverity = z.infer<typeof GuardianSeveritySchema>;

export const GuardianStatusSchema = z.enum(['pass', 'warning', 'block']);
export type GuardianStatus = z.infer<typeof GuardianStatusSchema>;

/**
 * Un hallazgo. `severity` (importancia) y `blocking` (no se ejecuta solo hasta resolverlo) son
 * independientes. Las evidencias son textos legibles ("ADN → Comunicación → tono: cálido"), nunca ids.
 */
export const GuardianFindingSchema = z.object({
  id: z.string(),
  evaluator: z.string(),
  dimension: GuardianDimensionSchema,
  severity: GuardianSeveritySchema,
  blocking: z.boolean(),
  code: z.string(),
  title: z.string(),
  message: z.string(),
  /** Lo que se encontró en el recurso. */
  evidence: z.array(z.string()),
  /** Qué parte del ADN o de la campaña lo sustenta. */
  brandEvidence: z.array(z.string()),
  recommendation: z.string().nullable(),
  canAutoFix: z.boolean(),
  canOverride: z.boolean(),
  /** El usuario decidió continuar de todas formas (solo si canOverride). */
  overridden: z.boolean(),
});
export type GuardianFinding = z.infer<typeof GuardianFindingSchema>;

export const GuardianDimensionResultSchema = z.object({
  dimension: GuardianDimensionSchema,
  applicable: z.boolean(),
  score: z.number().int().min(0).max(100).nullable(),
  status: GuardianStatusSchema,
  summary: z.string().nullable(),
  findingIds: z.array(z.string()),
});
export type GuardianDimensionResult = z.infer<typeof GuardianDimensionResultSchema>;

/** Campos corregidos por "Corregir con Pixel" (propuesta: el recurso no cambia hasta aplicarla). */
export const GuardianCorrectionFieldSchema = z.object({
  field: z.string(),
  label: z.string(),
  original: z.string(),
  corrected: z.string(),
});
export type GuardianCorrectionField = z.infer<typeof GuardianCorrectionFieldSchema>;

export const GuardianReportSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  contextType: z.literal('enterprise'),
  mode: GuardianModeSchema,
  resourceType: GuardianResourceTypeSchema,
  resourceId: ObjectIdSchema.nullable(),
  /** Nombre legible del recurso revisado ("Lanzamiento TINTO 500 g", "Texto pegado"). */
  resourceLabel: z.string(),
  brandDnaVersion: z.number().int().min(1),
  campaignId: ObjectIdSchema.nullable(),
  campaignStrategyVersion: z.number().int().min(1).nullable(),
  status: GuardianStatusSchema,
  /** Heurística 0–100 calculada por el backend sobre las dimensiones aplicables (null si ninguna). */
  score: z.number().int().min(0).max(100).nullable(),
  dimensions: z.array(GuardianDimensionResultSchema),
  findings: z.array(GuardianFindingSchema),
  summary: z.string(),
  generation: z.object({
    deterministic: z.boolean(),
    aiUsed: z.boolean(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    mode: z.enum(['ai', 'demo', 'rules']),
  }),
  /** Corrección propuesta (informe re-evaluado tras "Corregir con Pixel" o el preflight). */
  correction: z
    .object({
      fromReportId: ObjectIdSchema,
      fields: z.array(GuardianCorrectionFieldSchema),
      changes: z.array(z.string()),
      appliedAt: IsoDateSchema.nullable(),
    })
    .nullable(),
  sourceSnapshotHash: z.string(),
  /** El recurso cambió después de esta revisión (calculado al leer; nunca se regenera solo). */
  stale: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type GuardianReport = z.infer<typeof GuardianReportSchema>;

/** Resumen compacto para la propuesta de PixelCommand (preflight). */
export const GuardianPreflightSummarySchema = z.object({
  reportId: ObjectIdSchema,
  status: GuardianStatusSchema,
  score: z.number().int().min(0).max(100).nullable(),
  findings: z.array(
    GuardianFindingSchema.pick({
      id: true,
      severity: true,
      blocking: true,
      title: true,
      message: true,
      recommendation: true,
      canOverride: true,
      overridden: true,
    }),
  ),
  /** "Antes de mostrarte la propuesta ajusté el mensaje porque…" (solo si hubo corrección). */
  correctionNote: z.string().nullable(),
  overridden: z.boolean(),
});
export type GuardianPreflightSummary = z.infer<typeof GuardianPreflightSummarySchema>;

const factText = z.string().trim().min(1).max(300);

/**
 * POST /api/workspaces/:workspaceId/guardian/evaluate. Un recurso del workspace (`resourceId`) o un
 * texto pegado (`resourceType: 'copy'` + `content`, que no se guarda como ContentItem).
 * `confirmedFacts`: datos que el usuario aporta y que SÍ fundamentan cifras o promociones.
 */
export const EvaluateGuardianSchema = z
  .object({
    mode: GuardianModeSchema.optional(),
    resourceType: GuardianResourceTypeSchema.exclude(['pixel_proposal']),
    resourceId: ObjectIdSchema.optional(),
    content: z.string().trim().min(1).max(4000).optional(),
    confirmedFacts: z.array(factText).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.resourceType === 'copy') {
      if (!value.content) {
        ctx.addIssue({
          code: 'custom',
          path: ['content'],
          message: 'Pega el texto que quieres revisar',
        });
      }
    } else if (!value.resourceId) {
      ctx.addIssue({ code: 'custom', path: ['resourceId'], message: 'Elige qué quieres revisar' });
    }
  });
export type EvaluateGuardianInput = z.input<typeof EvaluateGuardianSchema>;
export type EvaluateGuardianData = z.output<typeof EvaluateGuardianSchema>;

export const GuardianReportListQuerySchema = z.object({
  resourceType: GuardianResourceTypeSchema.optional(),
  resourceId: ObjectIdSchema.optional(),
  status: GuardianStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type GuardianReportListQuery = z.output<typeof GuardianReportListQuerySchema>;

export const GuardianOverrideSchema = z.object({ findingId: z.string().min(1).max(40) }).strict();

export const GuardianReportResponseSchema = z.object({ report: GuardianReportSchema });
export type GuardianReportResponse = z.infer<typeof GuardianReportResponseSchema>;

export const GuardianReportListResponseSchema = z.object({
  reports: z.array(GuardianReportSchema),
  total: z.number().int().min(0),
});
export type GuardianReportListResponse = z.infer<typeof GuardianReportListResponseSchema>;

/* ---------- Salida estructurada de la evaluación semántica (IA o demo) ---------- */

/** Referencia controlada: BRAND_TRAIT_1, BRAND_RESTRICTION_2, CAMPAIGN_MESSAGE_1, RESOURCE_TEXT_1… */
const ControlledRefSchema = z.string().regex(/^[A-Z]+(?:_[A-Z]+)*_\d{1,3}$/);

export const GeneratedGuardianEvaluationSchema = z.object({
  dimensions: z
    .array(
      z.object({
        dimension: GuardianDimensionSchema,
        summary: z.string().max(400),
      }),
    )
    .max(8),
  findings: z
    .array(
      z.object({
        dimension: GuardianDimensionSchema,
        severity: GuardianSeveritySchema,
        code: z.string().regex(/^[a-z_]{3,60}$/),
        title: z.string().min(3).max(160),
        message: z.string().min(10).max(600),
        /** Lo evaluado que lo muestra (RESOURCE_*). */
        evidenceRefs: z.array(ControlledRefSchema).max(6),
        /** Qué parte del ADN o de la campaña lo sustenta (BRAND_*, CAMPAIGN_*). */
        brandRefs: z.array(ControlledRefSchema).max(6),
        recommendation: z.string().min(5).max(400),
      }),
    )
    .max(12),
});
export type GeneratedGuardianEvaluation = z.infer<typeof GeneratedGuardianEvaluationSchema>;

/** Salida estructurada de la corrección (una sola pasada; solo quita o suaviza, nunca inventa). */
export const GeneratedGuardianCorrectionSchema = z.object({
  fields: z
    .array(
      z.object({
        ref: ControlledRefSchema,
        corrected: z.string().min(1).max(4000),
      }),
    )
    .max(40),
  changes: z.array(z.string().max(300)).max(10),
});
export type GeneratedGuardianCorrection = z.infer<typeof GeneratedGuardianCorrectionSchema>;

export const GUARDIAN_STATUS_LABELS: Record<GuardianStatus, string> = {
  pass: 'Coherente',
  warning: 'Con ajustes recomendados',
  block: 'Resolver antes de continuar',
};

export const GUARDIAN_DIMENSION_LABELS: Record<GuardianDimension, string> = {
  identity: 'Identidad',
  communication: 'Comunicación',
  claims: 'Afirmaciones',
  restrictions: 'Restricciones',
  strategy: 'Estrategia',
  campaign_alignment: 'Campaña',
  content: 'Contenido',
  visual_direction: 'Dirección visual',
};

export const GUARDIAN_SEVERITY_LABELS: Record<GuardianSeverity, string> = {
  info: 'Nota',
  low: 'Leve',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const GUARDIAN_RESOURCE_LABELS: Record<GuardianResourceType, string> = {
  pixel_proposal: 'Propuesta de Pixel',
  campaign: 'Campaña',
  campaign_strategy: 'Estrategia de campaña',
  content_plan: 'Plan de contenido',
  content_plan_item: 'Propuesta del plan',
  content_item: 'Contenido',
  copy: 'Texto',
};
