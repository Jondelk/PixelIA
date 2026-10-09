import type { Campaign, CampaignDeliverable, CampaignStrategy } from '@pixel/contracts';
import { WORKSPACE_ID } from './operationsFixtures';

/** Datos de prueba con la forma exacta de los contratos del Campaign Manager. */

export const CAMPAIGN_ID = '64b7f0c2a1b2c3d4e5f60201';
const NOW = '2026-10-08T15:00:00.000Z';

export function campaignFixture(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Lanzamiento TINTO 500 g',
    description: null,
    status: 'draft',
    objective: 'Presentar la nueva presentación de 500 g y reforzar el origen.',
    campaignType: 'launch',
    productOrService: 'Café TINTO 500 g',
    targetAudience: ['Amantes del café de origen'],
    keyMessage: 'Café TINTO 500 g: el mismo origen.',
    startDate: '2026-11-01T12:00:00.000Z',
    endDate: '2026-11-30T12:00:00.000Z',
    problem: null,
    desiredOutcome: null,
    channels: ['Instagram', 'Punto de venta'],
    constraints: [],
    mandatoryElements: [],
    references: [],
    brandDnaVersion: 1,
    generatedBy: 'pixel',
    currentStrategyVersion: 1,
    stats: {
      deliverables: 3,
      proposedDeliverables: 2,
      convertedDeliverables: 1,
      projects: 1,
      contentItems: 0,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function strategyFixture(overrides: Partial<CampaignStrategy> = {}): CampaignStrategy {
  return {
    id: '64b7f0c2a1b2c3d4e5f60202',
    workspaceId: WORKSPACE_ID,
    campaignId: CAMPAIGN_ID,
    version: 1,
    strategicProblem: 'Presentar algo nuevo sin perder lo que nos hace reconocibles.',
    strategicOpportunity: 'Apoyar la campaña en el origen de la marca.',
    insight: 'Quien nos elige no solo busca café fresco: quiere conocer su origen.',
    insightType: 'brand_derived',
    bigIdea: 'Que la nueva presentación demuestre de dónde viene.',
    concept: 'Del origen a la mesa',
    campaignNarrative: 'Empezamos en la finca. Lo demostramos con piezas reales.',
    keyMessage: 'Café TINTO 500 g: el mismo origen.',
    supportingMessages: ['Trazabilidad lote a lote.', 'Tostión semanal.'],
    valueProposition: 'Café de origen con trazabilidad.',
    callToAction: 'Conócelo',
    tone: ['cálido', 'cercano'],
    visualDirection: {
      mood: ['artesanal'],
      colors: ['Tostado (principal)', 'Crema (acento: solo en detalles, nunca dominante)'],
      materials: ['papel kraft', 'madera'],
      composition: ['formas orgánicas'],
      photography: ['luz natural'],
      motion: ['ritmo pausado'],
      avoid: ['Neón', 'Brillos metálicos'],
    },
    channels: ['Instagram', 'Punto de venta'],
    contentPillars: [{ name: 'Origen', purpose: 'Mostrar la finca.' }],
    rationale: 'La campaña se apoya en el origen porque es central en el ADN de la marca.',
    brandDnaVersion: 1,
    generation: {
      provider: 'demo',
      model: 'pixel-demo-1',
      mode: 'demo',
      discardedDeliverables: 0,
      discardedClaims: 0,
    },
    createdAt: NOW,
    ...overrides,
  };
}

export function deliverableFixture(
  overrides: Partial<CampaignDeliverable> = {},
): CampaignDeliverable {
  return {
    id: '64b7f0c2a1b2c3d4e5f60210',
    workspaceId: WORKSPACE_ID,
    campaignId: CAMPAIGN_ID,
    strategyVersion: 1,
    title: 'Reel de lanzamiento',
    description: 'Video corto que presenta la nueva presentación.',
    type: 'content',
    platform: 'Instagram',
    format: 'Reel',
    objective: 'Presentar el producto',
    rationale: 'Muestra el origen en movimiento.',
    status: 'proposed',
    position: 0,
    convertedProjectId: null,
    convertedContentItemId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
