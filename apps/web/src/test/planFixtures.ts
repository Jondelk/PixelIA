import type { ContentPlan, ContentPlanItem } from '@pixel/contracts';
import { projectFixture, WORKSPACE_ID } from './operationsFixtures';

/** Planes y propuestas con la forma exacta de los contratos (Personal por defecto). */

const NOW = '2026-10-07T15:00:00.000Z';

export function planFixture(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '64b7f0c2a1b2c3d4e5f60040',
    workspaceId: WORKSPACE_ID,
    contextType: 'personal',
    name: 'Octubre · 12–25',
    objective: 'posicionamiento',
    period: { startDate: '2026-10-12', endDate: '2026-10-25' },
    strategySummary: 'Durante estas dos semanas propongo priorizar autoridad y proceso creativo.',
    pillars: [
      { name: 'Trabajo real', rationale: 'Tus proyectos activos son la fuente más honesta.' },
      { name: 'Autoridad', rationale: 'Une tus habilidades con lo que quieres conseguir.' },
    ],
    targetAudience: ['Emprendedores y marcas'],
    platforms: ['instagram'],
    status: 'draft',
    generatedBy: 'pixel',
    personalDnaVersion: 3,
    brandDnaVersion: null,
    campaignId: null,
    campaignStrategyVersion: null,
    editorialObjective: null,
    campaignAlignment: null,
    distributionRationale: null,
    generation: {
      provider: 'anthropic',
      model: 'claude',
      mode: 'ai',
      discardedItems: 1,
      frequencyPerWeek: 3,
      frequencySource: 'request',
      requestedGoal: 'posicionamiento',
      regeneratedFromPlanId: null,
    },
    itemCounts: { proposed: 1, accepted: 0, rejected: 1, converted: 1 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function itemFixture(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: '64b7f0c2a1b2c3d4e5f60050',
    workspaceId: WORKSPACE_ID,
    contentPlanId: '64b7f0c2a1b2c3d4e5f60040',
    projectId: projectFixture().id,
    campaignId: null,
    campaignDeliverableId: null,
    strategicRole: null,
    funnelStage: null,
    strategicMessage: null,
    brandRationale: null,
    title: 'Cómo convierto un brief confuso en una dirección creativa clara',
    concept: 'Un proceso real, paso a paso.',
    rationale: 'Demuestra criterio creativo a partir de un proceso real.',
    objective: 'Autoridad',
    audience: ['Emprendedores y marcas'],
    platform: 'instagram',
    format: 'reel',
    pillar: 'Autoridad',
    angle: 'process',
    hook: 'Todo brief confuso esconde una decisión.',
    suggestedAngle: null,
    scheduledFor: '2026-10-13T17:00:00.000Z',
    status: 'proposed',
    rejectionReason: null,
    convertedContentItemId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
