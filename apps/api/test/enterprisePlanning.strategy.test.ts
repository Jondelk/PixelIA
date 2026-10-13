import {
  BrandOnboardingSchema,
  type CampaignDeliverable,
  type CampaignStrategy,
  type GeneratedEnterpriseContentPlan,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AIProviderError, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { similarity } from '../src/modules/content-plans/contentPlanning.grounding.js';
import {
  buildEnterprisePayload,
  createEnterprisePlanningStrategy,
  groundEnterprisePlan,
  resolveEnterpriseRequest,
  type EnterprisePlanningCampaign,
  type EnterprisePlanningInput,
} from '../src/modules/content-plans/enterprisePlanning.strategy.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';

const logger = createLogger({ level: 'silent', format: 'json' });
const WS = '64b7f0c2a1b2c3d4e5f60001';
const NOW = '2026-10-08T15:00:00.000Z';
const oid = (n: number) => `64b7f0c2a1b2c3d4e5f6${String(n).padStart(4, '0')}`;

/** "Crea un plan de contenido de 7 días con 3 publicaciones para Instagram." */
const sevenDays = { startDate: '2026-10-19', endDate: '2026-10-25' };

function input(answers: typeof cafeTinto, overrides: Partial<EnterprisePlanningInput> = {}) {
  return {
    workspaceId: WS,
    company: { name: answers.company.name },
    brandDna: generateBrandDna(BrandOnboardingSchema.parse(answers)),
    campaign: null,
    activeProjects: [],
    recentContent: [],
    previousProposals: [],
    requestedPeriod: sevenDays,
    desiredFrequency: 3,
    requestedPlatforms: ['instagram'],
    tzOffset: 300,
    ...overrides,
  } satisfies EnterprisePlanningInput;
}

function strategy(overrides: Partial<CampaignStrategy> = {}): CampaignStrategy {
  return {
    id: oid(901),
    workspaceId: WS,
    campaignId: oid(900),
    version: 2,
    strategicProblem: 'Presentar la nueva presentación sin perder el origen.',
    strategicOpportunity: 'Podríamos apoyar la campaña en el origen de la marca.',
    insight: 'Quien nos elige quiere conocer el origen de su café fresco.',
    insightType: 'brand_derived',
    bigIdea: 'Que la nueva presentación demuestre de dónde viene.',
    concept: 'Del origen a la mesa',
    campaignNarrative: 'Empezamos en la finca. Lo demostramos con piezas reales.',
    keyMessage: 'El mismo origen, en cada taza.',
    supportingMessages: ['Trazabilidad lote a lote.', 'Tostión semanal.'],
    valueProposition: null,
    callToAction: 'Conócelo',
    tone: ['cálido', 'cercano'],
    visualDirection: {
      mood: ['artesanal'],
      colors: [],
      materials: ['madera'],
      composition: [],
      photography: [],
      motion: [],
      avoid: ['Neón'],
    },
    channels: ['Instagram', 'Punto de venta'],
    contentPillars: [
      { name: 'Origen', purpose: 'Mostrar la finca.' },
      { name: 'Producto', purpose: 'La nueva presentación.' },
    ],
    rationale: 'La campaña se apoya en el origen porque es central en el ADN de la marca.',
    brandDnaVersion: 1,
    generation: {
      provider: 'demo',
      model: 'demo',
      mode: 'demo',
      discardedDeliverables: 0,
      discardedClaims: 0,
      memoryKeys: [],
    },
    createdAt: NOW,
    ...overrides,
  };
}

function deliverable(overrides: Partial<CampaignDeliverable> = {}): CampaignDeliverable {
  return {
    id: oid(910),
    workspaceId: WS,
    campaignId: oid(900),
    strategyVersion: 2,
    title: 'Reel hero de lanzamiento',
    description: 'Video corto de lanzamiento.',
    type: 'content',
    platform: 'Instagram',
    format: 'Reel',
    objective: 'Presentar el producto',
    rationale: 'Muestra el origen.',
    status: 'proposed',
    position: 0,
    convertedProjectId: null,
    convertedContentItemId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function campaign(overrides: Partial<EnterprisePlanningCampaign> = {}): EnterprisePlanningCampaign {
  return {
    id: oid(900),
    name: 'Lanzamiento TINTO 500 g',
    objective: 'Lanzar la nueva presentación de 500 g',
    productOrService: 'Café TINTO 500 g',
    channels: ['Instagram', 'Punto de venta'],
    strategy: strategy(),
    deliverables: [
      deliverable(),
      deliverable({ id: oid(911), title: 'Carrusel de origen', format: 'Carrusel', position: 1 }),
    ],
    ...overrides,
  };
}

const demo = createEnterprisePlanningStrategy({ ai: new DemoProvider(), logger });

function fixedProvider(data: unknown): AIProvider {
  return {
    name: 'fixed',
    model: 'fixed-1',
    mode: 'ai',
    async generateText() {
      throw new Error('no usado');
    },
    async generateStructuredOutput<T>() {
      return { data: data as T, provider: 'fixed', model: 'fixed-1', mode: 'ai', latencyMs: 1 };
    },
  };
}

type RawItem = GeneratedEnterpriseContentPlan['items'][number];
const rawItem = (overrides: Partial<RawItem> = {}): RawItem => ({
  title: 'Origen, contado de cerca',
  concept: 'Desarrolla el pilar Origen desde la finca.',
  rationale: 'Pertenece a un pilar de la estrategia.',
  brandRationale: 'Usa madera y un tono cálido porque el ADN prioriza el origen.',
  objective: 'Mostrar visualmente el origen del producto',
  strategicRole: 'awareness',
  funnelStage: 'awareness',
  audience: [],
  platform: 'instagram',
  format: 'reel',
  pillar: 'Origen',
  angle: 'storytelling',
  strategicMessage: 'El mismo origen, en cada taza.',
  hook: 'Esto empieza en la finca.',
  suggestedAngle: null,
  deliverableRef: null,
  projectRef: null,
  suggestedDate: '2026-10-19',
  ...overrides,
});
const rawPlan = (items: RawItem[], overrides: Partial<GeneratedEnterpriseContentPlan> = {}) =>
  ({
    strategySummary: 'El plan desarrolla la campaña desde el origen de la marca.',
    editorialObjective: 'Presentar la nueva presentación desde el origen',
    campaignAlignment: 'Cada pieza parte de un pilar de la estrategia.',
    distributionRationale: 'Abre con el origen y cierra con el producto.',
    pillars: [
      { name: 'Origen', purpose: 'Mostrar la finca.' },
      { name: 'Producto', purpose: 'La nueva presentación.' },
    ],
    items,
    ...overrides,
  }) satisfies GeneratedEnterpriseContentPlan;

function ground(raw: GeneratedEnterpriseContentPlan, base: EnterprisePlanningInput) {
  const request = resolveEnterpriseRequest(base);
  const { payload, refs } = buildEnterprisePayload(base, request);
  return groundEnterprisePlan(raw, payload, refs, request, 300);
}

describe('Prueba crítica: mismo pedido, TINTO e INVENTIA (sin campaña)', () => {
  it('7 días, 3 publicaciones, Instagram: lógica editorial distinta, no solo sustantivos', async () => {
    const tinto = await demo.plan(input(cafeTinto));
    const lab = await demo.plan(input(inventia));
    expect(tinto.items).toHaveLength(3);
    expect(lab.items).toHaveLength(3);

    expect(similarity(tinto.strategySummary, lab.strategySummary)).toBeLessThan(0.4);
    expect(tinto.editorialObjective).not.toBe(lab.editorialObjective);
    expect(tinto.pillars.map((p) => p.name)).not.toEqual(lab.pillars.map((p) => p.name));
    // La estructura editorial cambia: no es la misma plantilla con otro sustantivo.
    const shape = (text: string) => text.split(':')[0];
    expect(tinto.items.map((i) => shape(i.title))).not.toEqual(
      lab.items.map((i) => shape(i.title)),
    );
    expect(tinto.items.map((i) => i.angle)).not.toEqual(lab.items.map((i) => i.angle));
    for (const [a, b] of tinto.items.map((item, i) => [item, lab.items[i]!] as const)) {
      expect(similarity(a.concept, b.concept)).toBeLessThan(0.3);
      expect(similarity(a.hook ?? '', b.hook ?? '')).toBeLessThan(0.3);
      expect(similarity(a.brandRationale, b.brandRationale)).toBeLessThan(0.5);
      expect(a.strategicMessage).not.toBe(b.strategicMessage);
    }
    expect(tinto.strategySummary).toMatch(/personas, el oficio/);
    expect(lab.strategySummary).toMatch(/proceso, pruebas/);
    expect(JSON.stringify(lab)).not.toMatch(/Huila|Tinto|café|finca/i);
    expect(JSON.stringify(tinto)).not.toMatch(/INVENTIA|prototipo|filamento/i);
    // Sin campaña no se finge ninguna.
    expect(tinto.campaignAlignment).toBeNull();
    expect(tinto.items.every((item) => item.campaignDeliverableId === null)).toBe(true);
  });
});

describe('Con campaña: el plan desarrolla la estrategia', () => {
  it('usa sus pilares, su mensaje y sus piezas pendientes', async () => {
    const plan = await demo.plan(input(cafeTinto, { campaign: campaign(), desiredFrequency: 4 }));
    expect(plan.pillars.map((pillar) => pillar.name)).toEqual(['Origen', 'Producto']);
    expect(plan.campaignAlignment).toMatch(/El mismo origen, en cada taza/);
    expect(plan.strategySummary).toMatch(/del origen a la mesa/);
    const fromDeliverables = plan.items.filter((item) => item.campaignDeliverableId);
    expect(fromDeliverables.map((item) => item.campaignDeliverableId)).toEqual([
      oid(910),
      oid(911),
    ]);
    expect(plan.items.every((item) => ['Origen', 'Producto'].includes(item.pillar ?? ''))).toBe(
      true,
    );
  });

  it('una pieza de campaña ya convertida no vuelve como pendiente idéntica', async () => {
    const converted = campaign({
      deliverables: [
        deliverable({ status: 'converted', convertedContentItemId: oid(950) }),
        deliverable({ id: oid(911), title: 'Carrusel de origen', format: 'Carrusel', position: 1 }),
      ],
    });
    const plan = await demo.plan(input(cafeTinto, { campaign: converted }));
    expect(plan.items.some((item) => item.campaignDeliverableId === oid(910))).toBe(false);
    expect(plan.items.some((item) => /Reel hero de lanzamiento/.test(item.title))).toBe(false);
    // Y si el modelo la propone igual, el motor la descarta.
    const grounded = ground(
      rawPlan([
        rawItem({ title: 'Reel hero de lanzamiento', deliverableRef: 'DELIVERABLE_1' }),
        rawItem({ title: 'Carrusel de origen, contado de cerca', deliverableRef: 'DELIVERABLE_2' }),
      ]),
      input(cafeTinto, { campaign: converted }),
    );
    expect(grounded.items.map((item) => item.campaignDeliverableId)).toEqual([oid(911)]);
  });

  it('no sustituye la campaña por contenido genérico ("5 razones para tomar café")', () => {
    const grounded = ground(
      rawPlan([
        rawItem({
          title: 'Cinco razones para tomar café',
          concept: 'Beneficios generales de tomar café por la mañana.',
          pillar: 'Bienestar',
          strategicMessage: null,
        }),
        rawItem(),
      ]),
      input(cafeTinto, { campaign: campaign() }),
    );
    expect(grounded.items.map((item) => item.title)).toEqual(['Origen, contado de cerca']);
    expect(grounded.discardedItems).toBe(1);
  });

  it('Campaña A y campaña B de la misma marca producen planes distintos', async () => {
    const a = await demo.plan(input(cafeTinto, { campaign: campaign() }));
    const b = await demo.plan(
      input(cafeTinto, {
        campaign: campaign({
          id: oid(920),
          name: 'Educación sobre origen',
          objective: 'Explicar de dónde viene cada lote',
          deliverables: [deliverable({ id: oid(930), title: 'Guía del lote', format: 'Carrusel' })],
          strategy: strategy({
            concept: 'Lee tu lote',
            bigIdea: 'Enseñar a leer la etiqueta de cada lote.',
            keyMessage: 'Cada lote tiene una historia que puedes leer.',
            supportingMessages: ['Tostión semanal.'],
            contentPillars: [
              { name: 'Trazabilidad', purpose: 'Cómo se sigue un lote.' },
              { name: 'Cultura cafetera', purpose: 'Lo que hay detrás de una taza.' },
            ],
          }),
        }),
      }),
    );
    expect(a.pillars.map((p) => p.name)).not.toEqual(b.pillars.map((p) => p.name));
    expect(a.strategySummary).not.toBe(b.strategySummary);
    expect(a.items.map((i) => i.title)).not.toEqual(b.items.map((i) => i.title));
    expect(a.items.map((i) => i.strategicMessage)).not.toEqual(
      b.items.map((i) => i.strategicMessage),
    );
  });
});

describe('Validación de fundamento y referencias', () => {
  it('"20% de descuento", "el café favorito de Popayán" y "2026 clientes" no se persisten', () => {
    const grounded = ground(
      rawPlan([
        rawItem({ title: 'Lanzamiento con 20% de descuento' }),
        rawItem({ title: 'El café favorito de Popayán', hook: 'El café favorito de Popayán.' }),
        rawItem({ title: 'Origen para 2026 clientes' }),
        rawItem({ title: 'Producto, contado de cerca', pillar: 'Producto' }),
      ]),
      input(cafeTinto, { campaign: campaign() }),
    );
    expect(grounded.items.map((item) => item.title)).toEqual(['Producto, contado de cerca']);
    expect(grounded.discardedItems).toBe(3);
  });

  it('referencias desconocidas (DELIVERABLE_999, PROJECT_7) descartan la propuesta', () => {
    const grounded = ground(
      rawPlan([
        rawItem({ deliverableRef: 'DELIVERABLE_999' }),
        rawItem({
          title: 'Producto, contado de cerca',
          projectRef: 'PROJECT_7',
          pillar: 'Producto',
        }),
        rawItem({ title: 'Reel hero, desde el origen', deliverableRef: 'DELIVERABLE_1' }),
      ]),
      input(cafeTinto, { campaign: campaign() }),
    );
    expect(grounded.items.map((item) => item.campaignDeliverableId)).toEqual([oid(910)]);
    expect(grounded.discardedItems).toBe(2);
  });

  it('el modelo nunca ve ids de Mongo: solo referencias controladas', () => {
    const base = input(cafeTinto, { campaign: campaign() });
    const { payload } = buildEnterprisePayload(base, resolveEnterpriseRequest(base));
    expect(JSON.stringify(payload)).not.toMatch(/64b7f0c2a1b2c3d4e5f6/);
    expect(payload.deliverables.map((d) => d.ref)).toEqual(['DELIVERABLE_1', 'DELIVERABLE_2']);
    expect(payload.campaign?.ref).toBe('CAMPAIGN_1');
    expect(payload.campaign?.strategyVersion).toBe(2);
  });

  it('sin campaña, la alineación con campaña se anula aunque el modelo la escriba', () => {
    const grounded = ground(
      rawPlan([rawItem({ pillar: 'Origen' })], { campaignAlignment: 'Desarrolla la campaña.' }),
      input(cafeTinto),
    );
    expect(grounded.campaignAlignment).toBeNull();
  });

  it('no repite contenido reciente (misma idea y mismo hook)', () => {
    const grounded = ground(
      rawPlan([
        rawItem({ title: 'De dónde viene nuestro café', hook: 'Todo empieza en la finca.' }),
        rawItem({
          title: 'Producto, contado de cerca',
          pillar: 'Producto',
          hook: 'Todo empieza en la finca.',
        }),
        rawItem({ title: 'Origen, de cerca', hook: 'Mira la finca despacio.' }),
      ]),
      input(cafeTinto, {
        campaign: campaign(),
        recentContent: [
          {
            id: oid(960),
            workspaceId: WS,
            projectId: null,
            campaignId: null,
            title: 'De dónde viene nuestro café',
            concept: null,
            objective: null,
            platform: 'instagram',
            format: 'reel',
            status: 'published',
            hook: 'Todo empieza en la finca.',
            caption: null,
            script: null,
            notes: null,
            scheduledFor: null,
            publishedAt: NOW,
            tags: [],
            source: 'manual',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    );
    expect(grounded.items.map((item) => item.title)).toEqual(['Origen, de cerca']);
  });

  it('plataformas: pedidas → canales de la campaña → error claro; nunca otras', () => {
    expect(
      resolveEnterpriseRequest(input(cafeTinto, { campaign: campaign(), requestedPlatforms: [] }))
        .allowedPlatforms,
    ).toEqual(['instagram']);
    expect(() =>
      resolveEnterpriseRequest(
        input(cafeTinto, {
          requestedPlatforms: [],
          campaign: campaign({
            channels: ['Punto de venta'],
            strategy: strategy({ channels: ['Punto de venta'] }),
          }),
        }),
      ),
    ).toThrow(/plataforma/);
    const grounded = ground(
      rawPlan([
        rawItem({ platform: 'tiktok', format: 'short_video' }),
        rawItem({ title: 'Producto, de cerca', pillar: 'Producto' }),
      ]),
      input(cafeTinto, { campaign: campaign() }),
    );
    expect(grounded.items.map((item) => item.platform)).toEqual(['instagram']);
  });

  it('frecuencia conservadora por defecto (3/semana) y nunca más de 30 piezas', () => {
    expect(
      resolveEnterpriseRequest(input(cafeTinto, { desiredFrequency: undefined })).itemCount,
    ).toBe(3);
    expect(
      resolveEnterpriseRequest(
        input(cafeTinto, {
          requestedPeriod: { startDate: '2026-10-01', endDate: '2026-10-30' },
          desiredFrequency: 14,
        }),
      ).itemCount,
    ).toBe(30);
  });
});

describe('Errores del proveedor', () => {
  it('caído → unavailable; salida inválida → failed (sin plan de relleno)', async () => {
    const down: AIProvider = {
      ...fixedProvider(null),
      async generateStructuredOutput() {
        throw new AIProviderError('unavailable', 'caído');
      },
    };
    await expect(
      createEnterprisePlanningStrategy({ ai: down, logger }).plan(input(cafeTinto)),
    ).rejects.toMatchObject({
      kind: 'unavailable',
    });
    await expect(
      createEnterprisePlanningStrategy({ ai: fixedProvider({ items: [] }), logger }).plan(
        input(cafeTinto),
      ),
    ).rejects.toMatchObject({ kind: 'failed' });
  });
});
