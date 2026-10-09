import { z } from 'zod';
import { CampaignSchema } from './campaign.js';
import { CampaignDeliverableSchema, CampaignDeliverableTypeSchema } from './campaignDeliverable.js';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/*
 * CampaignStrategy: la dirección creativa de una campaña. VERSIONADA: cada generación crea una
 * versión nueva ({workspaceId, campaignId, version} único) y las anteriores se conservan; la campaña
 * apunta a la vigente (`currentStrategyVersion`). La genera el CampaignStrategyEngine desde el
 * BrandDNA y el brief; después pasa la validación de fundamento (sin cifras, clientes, claims ni
 * productos inventados). Ver docs/CAMPAIGNS.md.
 */

/**
 * De dónde sale el insight. Si no viene del ADN ni del brief, es una HIPÓTESIS estratégica (no hay
 * investigación de mercado detrás) y la UI lo dice así.
 */
export const InsightTypeSchema = z.enum(['brand_derived', 'brief_derived', 'strategic_hypothesis']);
export type InsightType = z.infer<typeof InsightTypeSchema>;

export const VisualDirectionSchema = z.object({
  mood: z.array(z.string()),
  colors: z.array(z.string()),
  materials: z.array(z.string()),
  composition: z.array(z.string()),
  photography: z.array(z.string()),
  motion: z.array(z.string()),
  avoid: z.array(z.string()),
});
export type VisualDirection = z.infer<typeof VisualDirectionSchema>;

export const CampaignPillarSchema = z.object({ name: z.string(), purpose: z.string() });
export type CampaignPillar = z.infer<typeof CampaignPillarSchema>;

export const CampaignStrategySchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  campaignId: ObjectIdSchema,
  version: z.number().int().min(1),
  strategicProblem: z.string(),
  strategicOpportunity: z.string(),
  insight: z.string(),
  insightType: InsightTypeSchema,
  bigIdea: z.string(),
  concept: z.string(),
  campaignNarrative: z.string(),
  keyMessage: z.string(),
  supportingMessages: z.array(z.string()),
  valueProposition: z.string().nullable(),
  callToAction: z.string().nullable(),
  tone: z.array(z.string()),
  visualDirection: VisualDirectionSchema,
  channels: z.array(z.string()),
  contentPillars: z.array(CampaignPillarSchema),
  /** Por qué esta campaña representa a la marca (conexión con el ADN). */
  rationale: z.string(),
  brandDnaVersion: z.number().int().min(1),
  generation: z.object({
    provider: z.string(),
    model: z.string(),
    mode: z.enum(['ai', 'demo']),
    /** Piezas que la validación de fundamento descartó. */
    discardedDeliverables: z.number().int().min(0),
    /** Textos o elementos descartados o recortados por afirmaciones sin base. */
    discardedClaims: z.number().int().min(0),
  }),
  createdAt: IsoDateSchema,
});
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;

/** GET …/strategy[?version=n]: la versión pedida (o la vigente) y las versiones existentes. */
export const CampaignStrategyQuerySchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
});
export type CampaignStrategyQuery = z.output<typeof CampaignStrategyQuerySchema>;

export const CampaignStrategyResponseSchema = z.object({
  strategy: CampaignStrategySchema.nullable(),
  versions: z.array(z.number().int().min(1)),
});
export type CampaignStrategyResponse = z.infer<typeof CampaignStrategyResponseSchema>;

/* ---------- Salida estructurada de la IA (validada con Zod) ---------- */

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const texts = (maxItems: number, maxChars: number, minItems = 0) =>
  z.array(text(2, maxChars)).min(minItems).max(maxItems);

export const GeneratedCampaignDeliverableSchema = z.object({
  title: text(3, 160),
  description: text(3, 600),
  type: CampaignDeliverableTypeSchema,
  platform: text(2, 60).nullable().optional(),
  format: text(2, 60).nullable().optional(),
  objective: text(3, 300).nullable().optional(),
  rationale: text(3, 500),
});
export type GeneratedCampaignDeliverable = z.infer<typeof GeneratedCampaignDeliverableSchema>;

export const CAMPAIGN_MAX_DELIVERABLES = 12;

export const GeneratedCampaignStrategySchema = z.object({
  strategicProblem: text(10, 600),
  strategicOpportunity: text(10, 600),
  insight: text(10, 500),
  insightType: InsightTypeSchema,
  bigIdea: text(3, 300),
  concept: text(3, 200),
  campaignNarrative: text(20, 1500),
  keyMessage: text(3, 200),
  supportingMessages: texts(6, 240, 1),
  valueProposition: text(3, 400).nullable().optional(),
  callToAction: text(2, 120).nullable().optional(),
  tone: texts(6, 40, 1),
  visualDirection: z.object({
    mood: texts(8, 160),
    colors: texts(8, 160),
    materials: texts(8, 160),
    composition: texts(8, 160),
    photography: texts(8, 160),
    motion: texts(8, 160),
    avoid: texts(12, 160),
  }),
  channels: texts(8, 60, 1),
  contentPillars: z
    .array(z.object({ name: text(2, 80), purpose: text(3, 300) }))
    .min(1)
    .max(5),
  deliverables: z.array(GeneratedCampaignDeliverableSchema).min(1).max(CAMPAIGN_MAX_DELIVERABLES),
  rationale: text(20, 1200),
});
export type GeneratedCampaignStrategy = z.infer<typeof GeneratedCampaignStrategySchema>;

/* ---------- Etiquetas de producto (UI en español) ---------- */

export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  brand_derived: 'Derivado del ADN de la marca',
  brief_derived: 'Derivado del brief',
  strategic_hypothesis: 'Hipótesis estratégica',
};

/** Respuesta de POST …/campaigns/generate y …/strategy/generate (201). */
export const CampaignGenerationResponseSchema = z.object({
  campaign: CampaignSchema,
  strategy: CampaignStrategySchema,
  deliverables: z.array(CampaignDeliverableSchema),
});
export type CampaignGenerationResponse = z.infer<typeof CampaignGenerationResponseSchema>;
