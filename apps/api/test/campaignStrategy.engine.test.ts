import { BrandOnboardingSchema, type GeneratedCampaignStrategy } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AIProviderError, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { similarity } from '../src/modules/content-plans/contentPlanning.grounding.js';
import {
  buildCampaignPayload,
  CampaignStrategyError,
  createCampaignStrategyEngine,
  groundCampaignStrategy,
  type CampaignBrief,
  type CampaignStrategyInput,
} from '../src/modules/campaigns/campaignStrategy.engine.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';

const logger = createLogger({ level: 'silent', format: 'json' });

const brief = (overrides: Partial<CampaignBrief> = {}): CampaignBrief => ({
  objective: 'Necesitamos lanzar un nuevo producto.',
  campaignType: 'launch',
  productOrService: null,
  description: null,
  targetAudience: [],
  problem: null,
  desiredOutcome: null,
  channels: ['Instagram'],
  constraints: [],
  mandatoryElements: [],
  references: [],
  startDate: '2026-11-01',
  endDate: '2026-11-15',
  ...overrides,
});

function input(answers: typeof cafeTinto, overrides: Partial<CampaignStrategyInput> = {}) {
  return {
    workspaceId: '64b7f0c2a1b2c3d4e5f60001',
    company: { name: answers.company.name },
    brandDna: generateBrandDna(BrandOnboardingSchema.parse(answers)),
    brief: brief(),
    recentCampaigns: [],
    previousVersions: [],
    activeProjects: [],
    recentContent: [],
    ...overrides,
  } satisfies CampaignStrategyInput;
}

const demo = createCampaignStrategyEngine({ ai: new DemoProvider(), logger });

/** Proveedor que devuelve una salida fija (para probar la validación sin modelo). */
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

/** Salida válida de base (TINTO) que cada test altera. */
function baseOutput(): GeneratedCampaignStrategy {
  return {
    strategicProblem: 'Café Tinto necesita presentar algo nuevo sin perder su origen.',
    strategicOpportunity: 'Podríamos apoyar la campaña en el origen y la finca.',
    insight: 'Quien nos elige quiere conocer el origen de su café fresco.',
    insightType: 'brand_derived',
    bigIdea: 'Que cada pieza muestre la finca del Huila como prueba visible.',
    concept: 'Del origen a tu mesa',
    campaignNarrative:
      'Empezamos en la finca. Mostramos el oficio con luz natural. Cerramos con el café en la mesa.',
    keyMessage: 'El mismo origen, en cada taza.',
    supportingMessages: ['Trazabilidad lote a lote.', 'Tostión semanal.'],
    valueProposition: 'Café de origen con trazabilidad lote a lote.',
    callToAction: 'Conócelo',
    tone: ['cálido', 'cercano'],
    visualDirection: {
      mood: ['artesanal', 'natural'],
      colors: ['Tostado como color principal', 'Crema de apoyo'],
      materials: ['papel kraft', 'madera'],
      composition: ['café en primer plano'],
      photography: ['luz natural'],
      motion: ['ritmo pausado'],
      avoid: [],
    },
    channels: ['Instagram'],
    contentPillars: [{ name: 'Origen', purpose: 'Mostrar la finca y su oficio.' }],
    deliverables: [
      {
        title: 'Reel de la finca',
        description: 'Video corto del proceso en la finca.',
        type: 'content',
        platform: 'Instagram',
        format: 'Reel',
        objective: 'Presentar el producto',
        rationale: 'Muestra el origen en movimiento.',
      },
    ],
    rationale:
      'La campaña se apoya en el origen porque es central en el ADN de Café Tinto y la diferencia sin una comunicación agresiva.',
  };
}

const groundTinto = (
  output: GeneratedCampaignStrategy,
  overrides: Partial<CampaignStrategyInput> = {},
) => groundCampaignStrategy(output, buildCampaignPayload(input(cafeTinto, overrides)));

describe('CampaignStrategyEngine (demo): misma petición, marcas distintas', () => {
  it('TINTO e INVENTIA producen campañas claramente distintas ante el mismo objetivo', async () => {
    const tinto = await demo.generate(input(cafeTinto));
    const lab = await demo.generate(input(inventia));

    // Concepto, mensaje y big idea distintos (no son la misma plantilla con otro nombre).
    expect(tinto.strategy.concept).not.toBe(lab.strategy.concept);
    expect(similarity(tinto.strategy.bigIdea, lab.strategy.bigIdea)).toBeLessThan(0.3);
    expect(similarity(tinto.strategy.keyMessage, lab.strategy.keyMessage)).toBeLessThan(0.3);
    // TINTO: origen, finca, calidez. INVENTIA: técnica, precisión, sin el Huila.
    expect(tinto.strategy.concept).toMatch(/origen|Huila/i);
    expect(JSON.stringify(lab.strategy)).not.toMatch(/Huila|finca|caf[eé]/i);
    expect(tinto.strategy.tone).toEqual(expect.arrayContaining(['cálido', 'cercano']));
    expect(lab.strategy.tone).toEqual(expect.arrayContaining(['claro', 'técnico']));
    // Dirección de arte desde cada paleta y materiales; cada una evita lo suyo.
    expect(tinto.strategy.visualDirection.colors.join(' ')).toMatch(/Tostado/);
    expect(lab.strategy.visualDirection.colors.join(' ')).toMatch(/Azul acero/);
    expect(lab.strategy.visualDirection.colors.find((c) => /Naranja/.test(c))).toMatch(
      /acento.*nunca dominante/,
    );
    expect(tinto.strategy.visualDirection.materials).toEqual(
      expect.arrayContaining(['papel kraft', 'madera']),
    );
    expect(lab.strategy.visualDirection.materials).toEqual(expect.arrayContaining(['aluminio']));
    expect(tinto.strategy.visualDirection.avoid).toEqual(expect.arrayContaining(['Neón']));
    expect(lab.strategy.visualDirection.avoid).toEqual(
      expect.arrayContaining(['Texturas rústicas']),
    );
    expect(lab.strategy.visualDirection.motion[0]).toMatch(/ágil/);
    expect(tinto.strategy.visualDirection.motion[0]).toMatch(/pausado/);
    // Piezas distintas.
    const titles = (proposal: typeof tinto) => proposal.deliverables.map((item) => item.title);
    expect(titles(tinto)).not.toEqual(titles(lab));
    expect(tinto.meta.mode).toBe('demo');
  });

  it('canales del brief: solo esos; sin canales sugiere y lo justifica (no IG + TikTok + YouTube)', async () => {
    const onlyInstagram = await demo.generate(input(cafeTinto));
    expect(onlyInstagram.strategy.channels).toEqual(['Instagram']);
    expect(onlyInstagram.deliverables.every((d) => !d.platform || d.platform === 'Instagram')).toBe(
      true,
    );
    const suggested = await demo.generate(input(cafeTinto, { brief: brief({ channels: [] }) }));
    expect(suggested.strategy.channels).not.toEqual(expect.arrayContaining(['TikTok', 'YouTube']));
    expect(suggested.strategy.rationale).toMatch(/El brief no indica canales/);
  });

  it('varias piezas del mismo concepto en canales distintos no se descartan como duplicadas', async () => {
    const lab = await demo.generate(
      input(inventia, { brief: brief({ channels: ['Instagram', 'Facebook', 'LinkedIn'] }) }),
    );
    expect(lab.discardedDeliverables).toBe(0);
    expect(new Set(lab.deliverables.map((d) => d.platform))).toEqual(
      new Set(['Instagram', 'Facebook', 'LinkedIn', null]),
    );
  });

  it('las piezas de contenido son "content" (ContentItem) y las de producción, proyectos', async () => {
    const { deliverables } = await demo.generate(input(cafeTinto));
    expect(deliverables.find((d) => /Reel/.test(d.title))?.type).toBe('content');
    expect(deliverables.find((d) => /gráfica/.test(d.title))?.type).toBe('design');
    expect(deliverables.every((d) => d.rationale.length > 0)).toBe(true);
  });

  it('al regenerar (versión anterior en el contexto) cambia la palanca creativa', async () => {
    const v1 = await demo.generate(input(cafeTinto));
    const v2 = await demo.generate(
      input(cafeTinto, {
        previousVersions: [
          {
            bigIdea: v1.strategy.bigIdea,
            concept: v1.strategy.concept,
            keyMessage: v1.strategy.keyMessage,
          },
        ],
      }),
    );
    expect(v2.strategy.concept).not.toBe(v1.strategy.concept);
  });
});

describe('Validación de fundamento (anti-alucinación)', () => {
  it('"50 años de experiencia" no pasa: se recorta la frase o se descarta el elemento', () => {
    const output = baseOutput();
    output.campaignNarrative =
      'Empezamos en la finca. Llevamos 50 años de experiencia tostando. Cerramos en la mesa.';
    output.supportingMessages = ['50 años de experiencia.', 'Tostión semanal.'];
    const grounded = groundTinto(output);
    expect(grounded.strategy.campaignNarrative).not.toMatch(/50 años/);
    expect(grounded.strategy.campaignNarrative).toMatch(/finca/);
    expect(grounded.strategy.supportingMessages).toEqual(['Tostión semanal.']);
    expect(grounded.discardedClaims).toBeGreaterThanOrEqual(2);
  });

  it('un producto o claim inexistente presentado como hecho no se persiste', () => {
    const output = baseOutput();
    output.valueProposition = 'Café Tinto Gold Edition, el más vendido del país.';
    output.supportingMessages = [
      'Somos líderes del mercado.',
      'Café premiado.',
      'Tostión semanal.',
    ];
    output.deliverables.push({
      title: 'Lanzamiento de Tinto Reserva Platino',
      description: 'Presentar la edición Platino.',
      type: 'content',
      platform: 'Instagram',
      format: 'Reel',
      objective: 'Vender',
      rationale: 'Es nuestro producto estrella.',
    });
    const grounded = groundTinto(output);
    expect(grounded.strategy.valueProposition).toBeNull();
    expect(grounded.strategy.supportingMessages).toEqual(['Tostión semanal.']);
    expect(grounded.deliverables.map((d) => d.title)).toEqual(['Reel de la finca']);
    expect(grounded.discardedDeliverables).toBe(1);
  });

  it('cifras y afirmaciones sobre clientes: "valoran un 40 % más el origen" se rechaza', () => {
    const output = baseOutput();
    output.strategicOpportunity =
      'Podríamos apoyarnos en el origen. Nuestros clientes valoran un 40% más el origen.';
    const grounded = groundTinto(output);
    expect(grounded.strategy.strategicOpportunity).toBe('Podríamos apoyarnos en el origen.');
  });

  it('si un campo obligatorio no se apoya en nada, la estrategia falla (no se inventa)', () => {
    const output = baseOutput();
    output.concept = 'Tinto Gold Edition';
    expect(() => groundTinto(output)).toThrow(CampaignStrategyError);
  });

  it('dirección visual: fuera lo que la marca evita y los colores ajenos a la paleta', () => {
    const output = baseOutput();
    output.visualDirection.mood = ['cyberpunk con neón', 'artesanal'];
    output.visualDirection.colors = ['Tostado principal', 'Magenta eléctrico'];
    output.visualDirection.photography = ['brillos metálicos', 'luz natural'];
    const grounded = groundTinto(output);
    expect(grounded.strategy.visualDirection.mood).toEqual(['artesanal']);
    expect(grounded.strategy.visualDirection.colors).toEqual(['Tostado principal']);
    expect(grounded.strategy.visualDirection.photography).toEqual(['luz natural']);
    expect(grounded.strategy.visualDirection.avoid).toEqual(
      expect.arrayContaining(['Neón', 'Brillos metálicos']),
    );
  });

  it('canales: con canales en el brief, ni la estrategia ni las piezas salen de ellos', () => {
    const output = baseOutput();
    output.channels = ['Instagram', 'TikTok', 'YouTube'];
    output.deliverables.push({
      title: 'Video para TikTok',
      description: 'Pieza para TikTok.',
      type: 'content',
      platform: 'TikTok',
      format: 'Video corto',
      objective: 'Alcance',
      rationale: 'Otro canal.',
    });
    const grounded = groundTinto(output);
    expect(grounded.strategy.channels).toEqual(['Instagram']);
    expect(grounded.deliverables.map((d) => d.platform)).toEqual(['Instagram']);
  });

  it('un insight que no sale del ADN ni del brief se guarda como hipótesis estratégica', () => {
    const output = baseOutput();
    output.insight = 'La gente compra rituales, no productos.';
    output.insightType = 'brand_derived';
    expect(groundTinto(output).strategy.insightType).toBe('strategic_hypothesis');
    // El que sí se apoya en las necesidades de la audiencia conserva su tipo.
    expect(groundTinto(baseOutput()).strategy.insightType).toBe('brand_derived');
  });

  it('repetir el concepto de una campaña reciente es un fallo (sin duplicación evidente)', () => {
    expect(() =>
      groundTinto(baseOutput(), {
        recentCampaigns: [
          { name: 'Otra', objective: 'Otra', concept: 'Del origen a tu mesa', keyMessage: null },
        ],
      }),
    ).toThrow(/repite/);
  });

  it('las piezas que repiten contenido reciente se descartan', () => {
    const grounded = groundCampaignStrategy(
      {
        ...baseOutput(),
        deliverables: [
          ...baseOutput().deliverables,
          { ...baseOutput().deliverables[0]!, title: 'Carrusel del origen' },
        ],
      },
      buildCampaignPayload(
        input(cafeTinto, {
          recentContent: [{ title: 'Reel de la finca', platform: null, format: null }],
        }),
      ),
    );
    expect(grounded.deliverables.map((d) => d.title)).toEqual(['Carrusel del origen']);
  });
});

describe('Errores del proveedor: sin estrategia de respaldo', () => {
  it('proveedor caído → unavailable; salida inválida → failed', async () => {
    const down: AIProvider = {
      ...fixedProvider(null),
      async generateStructuredOutput() {
        throw new AIProviderError('unavailable', 'caído');
      },
    };
    await expect(
      createCampaignStrategyEngine({ ai: down, logger }).generate(input(cafeTinto)),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(
      createCampaignStrategyEngine({ ai: fixedProvider({ nada: true }), logger }).generate(
        input(cafeTinto),
      ),
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('el contexto enviado está acotado (sin ids ni listas ilimitadas)', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      title: `Pieza ${i}`,
      platform: null,
      format: null,
    }));
    const payload = buildCampaignPayload(input(cafeTinto, { recentContent: many }));
    expect(payload.recentContent).toHaveLength(20);
    expect(JSON.stringify(payload)).not.toMatch(/64b7f0c2a1b2c3d4e5f60001/);
  });
});
