import { describe, expect, it } from 'vitest';
import {
  ContentFunnelStageSchema,
  ContentPlanItemSchema,
  ContentPlanSchema,
  ContentStrategicRoleSchema,
  GenerateContentPlanSchema,
  GeneratedEnterpriseContentPlanSchema,
  workspaceSupportsFeature,
} from './index.js';

const NOW = '2026-10-08T15:00:00.000Z';
const ID = '64b7f0c2a1b2c3d4e5f60001';

const plan = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  workspaceId: ID,
  contextType: 'personal',
  name: 'Octubre',
  objective: null,
  period: { startDate: '2026-10-19', endDate: '2026-10-25' },
  strategySummary: null,
  pillars: [],
  targetAudience: [],
  platforms: ['instagram'],
  status: 'draft',
  generatedBy: 'pixel',
  personalDnaVersion: 1,
  generation: null,
  itemCounts: { proposed: 0, accepted: 0, rejected: 0, converted: 0 },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('ContentPlan: contexto Personal / Enterprise', () => {
  it('plan personal válido (los campos Enterprise toman null por defecto)', () => {
    expect(ContentPlanSchema.parse(plan())).toMatchObject({
      contextType: 'personal',
      brandDnaVersion: null,
      campaignId: null,
      campaignStrategyVersion: null,
    });
  });

  it('plan enterprise válido, con y sin campaña', () => {
    const enterprise = { contextType: 'enterprise', personalDnaVersion: null, brandDnaVersion: 2 };
    expect(ContentPlanSchema.safeParse(plan(enterprise)).success).toBe(true);
    expect(
      ContentPlanSchema.safeParse(
        plan({ ...enterprise, campaignId: ID, campaignStrategyVersion: 3 }),
      ).success,
    ).toBe(true);
    // Manual: sin BrandDNA está bien.
    expect(
      ContentPlanSchema.safeParse(
        plan({ contextType: 'enterprise', personalDnaVersion: null, generatedBy: 'manual' }),
      ).success,
    ).toBe(true);
  });

  it('rechaza combinaciones inválidas', () => {
    // ADN mezclado.
    expect(ContentPlanSchema.safeParse(plan({ brandDnaVersion: 1 })).success).toBe(false);
    expect(
      ContentPlanSchema.safeParse(
        plan({ contextType: 'enterprise', personalDnaVersion: 1, brandDnaVersion: 1 }),
      ).success,
    ).toBe(false);
    // Campaña en un plan personal.
    expect(
      ContentPlanSchema.safeParse(plan({ campaignId: ID, campaignStrategyVersion: 1 })).success,
    ).toBe(false);
    // Campaña sin la versión de su estrategia (o al revés).
    const enterprise = { contextType: 'enterprise', personalDnaVersion: null, brandDnaVersion: 1 };
    expect(ContentPlanSchema.safeParse(plan({ ...enterprise, campaignId: ID })).success).toBe(
      false,
    );
    expect(
      ContentPlanSchema.safeParse(plan({ ...enterprise, campaignStrategyVersion: 2 })).success,
    ).toBe(false);
    // Enterprise generado por Pixel sin BrandDNA.
    expect(
      ContentPlanSchema.safeParse(plan({ contextType: 'enterprise', personalDnaVersion: null }))
        .success,
    ).toBe(false);
  });
});

describe('ContentPlanItem: campos estratégicos', () => {
  it('roles y etapas del recorrido son enums cerrados', () => {
    expect(ContentStrategicRoleSchema.safeParse('launch').success).toBe(true);
    expect(ContentStrategicRoleSchema.safeParse('viral').success).toBe(false);
    expect(ContentFunnelStageSchema.safeParse('consideration').success).toBe(true);
    expect(ContentFunnelStageSchema.safeParse('purchase').success).toBe(false);
  });

  it('una propuesta anterior (sin los campos nuevos) sigue siendo válida', () => {
    const item = ContentPlanItemSchema.parse({
      id: ID,
      workspaceId: ID,
      contentPlanId: ID,
      projectId: null,
      title: 'Pieza',
      concept: null,
      rationale: null,
      objective: null,
      audience: [],
      platform: 'instagram',
      format: 'reel',
      pillar: null,
      angle: null,
      hook: null,
      suggestedAngle: null,
      scheduledFor: null,
      status: 'proposed',
      rejectionReason: null,
      convertedContentItemId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(item).toMatchObject({
      campaignId: null,
      campaignDeliverableId: null,
      strategicRole: null,
      funnelStage: null,
      strategicMessage: null,
      brandRationale: null,
    });
  });
});

describe('Generación Enterprise', () => {
  it('campaignId opcional en la petición; el planner existe en ambos tipos', () => {
    const base = { startDate: '2026-10-19', endDate: '2026-10-25' };
    expect(GenerateContentPlanSchema.parse({ ...base, campaignId: ID }).campaignId).toBe(ID);
    expect(GenerateContentPlanSchema.safeParse({ ...base, campaignId: 'x' }).success).toBe(false);
    expect(workspaceSupportsFeature('enterprise', 'contentPlanner')).toBe(true);
    expect(workspaceSupportsFeature('personal', 'contentPlanner')).toBe(true);
  });

  it('salida de la IA: formatos y plataformas del enum, referencias como texto controlado', () => {
    const shape = GeneratedEnterpriseContentPlanSchema.shape;
    expect(shape.items.element.shape.format.safeParse('reels').success).toBe(false);
    expect(shape.items.element.shape.platform.safeParse('meta').success).toBe(false);
    expect(GeneratedEnterpriseContentPlanSchema.safeParse({}).success).toBe(false);
  });
});
