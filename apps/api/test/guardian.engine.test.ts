import {
  BrandOnboardingSchema,
  type BrandDna,
  type CampaignStrategy,
  type GeneratedGuardianEvaluation,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { createGuardianEngine } from '../src/modules/guardian/guardian.engine.js';
import { aggregate, dimensionScore } from '../src/modules/guardian/guardian.score.js';
import type {
  GuardianEvaluationInput,
  GuardianVisualDirection,
} from '../src/modules/guardian/guardian.types.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';

const ID = '6ac93cc3a738fe62abe5b039';
const logger = createLogger({ level: 'silent', format: 'json' });
const dnaOf = (answers: typeof cafeTinto): BrandDna => ({
  ...generateBrandDna(BrandOnboardingSchema.parse(answers)),
  id: ID,
  companyId: ID,
  version: 1,
  generator: { kind: 'deterministic', version: 'rules-1' },
  createdAt: new Date().toISOString(),
});
const TINTO = { name: 'Café Tinto', dna: dnaOf(cafeTinto) };
const INVENTIA = { name: 'INVENTIA', dna: dnaOf(inventia) };

function input(
  brand: typeof TINTO,
  texts: string[],
  extra: Partial<GuardianEvaluationInput> & { visual?: GuardianVisualDirection } = {},
): GuardianEvaluationInput {
  const { visual, ...rest } = extra;
  return {
    workspaceId: ID,
    mode: 'copy',
    resourceType: 'copy',
    resourceId: null,
    brandName: brand.name,
    brandDna: brand.dna,
    campaign: null,
    campaignStrategy: null,
    userSupplied: [],
    resource: {
      label: 'Texto',
      texts: texts.map((text, index) => ({
        ref: `RESOURCE_TEXT_${index + 1}`,
        label: `Texto ${index + 1}`,
        text,
        role: 'copy',
        field: null,
        targetId: null,
      })),
      visualDirection: visual ?? null,
      pieces: [],
      updatedAt: null,
    },
    ...rest,
  };
}

const engine = createGuardianEngine({ ai: new DemoProvider(), logger });
const codes = async (value: GuardianEvaluationInput) =>
  (await engine.evaluate(value)).findings.map((finding) => finding.code);
const dimension = async (value: GuardianEvaluationInput, name: string) =>
  (await engine.evaluate(value)).dimensions.find((entry) => entry.dimension === name)!;

describe('Evaluadores deterministas', () => {
  it('palabra que la marca evita (TINTO evita «barato»)', async () => {
    const result = await engine.evaluate(input(TINTO, ['Un café barato para cada mañana.']));
    const finding = result.findings.find((item) => item.code === 'avoid_word');
    expect(finding?.brandEvidence[0]).toMatch(/ADN → Comunicación → palabras que evita: barato/);
  });

  it('promoción inventada → BLOCK sin override; aportada como dato → sin hallazgo', async () => {
    const invented = await engine.evaluate(input(TINTO, ['Llévate TINTO con 20% de descuento.']));
    const promo = invented.findings.find((item) => item.code === 'invented_promotion')!;
    expect(invented.status).toBe('block');
    expect(promo).toMatchObject({
      blocking: true,
      canOverride: false,
      canAutoFix: true,
      severity: 'critical',
    });
    const supplied = await codes(
      input(TINTO, ['Llévate TINTO con 20% de descuento.'], {
        userSupplied: ['Tenemos 20% de descuento hasta el domingo'],
      }),
    );
    expect(supplied).not.toContain('invented_promotion');
    expect(supplied).not.toContain('ungrounded_figure');
  });

  it('claim de mercado sin fundamento: «El café #1 del Cauca.»', async () => {
    const result = await engine.evaluate(input(TINTO, ['El café #1 del Cauca.']));
    expect(result.status).toBe('block');
    expect(result.findings.map((item) => item.code)).toContain('ungrounded_market_claim');
  });

  it('un dato aportado no es falso positivo; una fecha no fundamenta una cifra', async () => {
    expect(
      await codes(
        input(TINTO, ['Nueva presentación de 500 g.'], {
          userSupplied: ['La presentación es de 500 g'],
        }),
      ),
    ).not.toContain('ungrounded_figure');
    const dated = await codes(
      input(TINTO, ['2026 clientes ya eligen nuestro café.'], {
        userSupplied: ['Lanzamiento el 2026-10-20'],
      }),
    );
    expect(dated).toContain('ungrounded_figure');
  });

  it('restricción explícita («No mostrar café instantáneo»): BLOCK que el usuario puede superar', async () => {
    const result = await engine.evaluate(
      input(TINTO, ['Un tutorial para preparar café instantáneo en casa.']),
    );
    const finding = result.findings.find((item) => item.code === 'explicit_restriction')!;
    expect(finding).toMatchObject({ blocking: true, canOverride: true });
    expect(finding.brandEvidence[0]).toMatch(/No mostrar café instantáneo/);
  });

  it('una preferencia (luz natural) no prohíbe lo demás', async () => {
    expect(
      await codes(input(TINTO, ['Fotografía de estudio del empaque con luz controlada.'])),
    ).not.toContain('explicit_restriction');
  });
});

describe('Identidad, comunicación y marca', () => {
  it('TINTO: artesanal y de origen se alinea; cyberpunk y agresivo genera hallazgos', async () => {
    const good = await dimension(
      input(TINTO, ['Del origen en la finca a tu taza, tostado con cuidado.']),
      'identity',
    );
    const bad = await dimension(
      input(TINTO, ['Una experiencia cyberpunk disruptiva y futurista.']),
      'identity',
    );
    expect(good.score!).toBeGreaterThan(bad.score!);
    expect(bad.findingIds.length).toBeGreaterThan(0);
  });

  it('TINTO: «¡COMPRA YA!» frente a una invitación cálida', async () => {
    const aggressive = await dimension(
      input(TINTO, ['¡COMPRA YA! ÚLTIMA OPORTUNIDAD!!!']),
      'communication',
    );
    const calm = await dimension(
      input(TINTO, ['Descubre el origen que acompaña cada taza.']),
      'communication',
    );
    expect(aggressive.status).toBe('warning');
    expect(calm.status).toBe('pass');
    expect(calm.score! - aggressive.score!).toBeGreaterThanOrEqual(25);
  });

  it('INVENTIA: proceso, prueba e iteración se alinean mejor que lujo aspiracional', async () => {
    const process = await dimension(
      input(INVENTIA, ['Iteración a iteración: probamos el prototipo capa a capa.']),
      'identity',
    );
    const luxury = await dimension(
      input(INVENTIA, ['Lujo aspiracional y exclusivo para una vida de glamour.']),
      'identity',
    );
    expect(process.score!).toBeGreaterThan(luxury.score!);
  });

  it('TINTO vs INVENTIA: el mismo texto genérico, diagnósticos distintos y sustentados', async () => {
    const copy =
      'Una campaña moderna, innovadora y disruptiva para conectar con nuestra audiencia.';
    const tinto = await engine.evaluate(input(TINTO, [copy]));
    const lab = await engine.evaluate(input(INVENTIA, [copy]));
    // TINTO es tradicional: "innovadora" choca con su identidad; INVENTIA es innovadora: no.
    expect(tinto.findings.map((item) => item.code)).toContain('identity_innovation');
    expect(lab.findings.map((item) => item.code)).not.toContain('identity_innovation');
    const tintoEvidence = tinto.findings.flatMap((item) => item.brandEvidence).join(' ');
    const labEvidence = lab.findings.flatMap((item) => item.brandEvidence).join(' ');
    expect(tintoEvidence).toMatch(/tradicional/);
    expect(labEvidence).toMatch(/Prototipo funcional en pocos días|Iteraciones documentadas/);
    expect(tinto.summary).not.toBe(lab.summary);
  });

  it('prueba crítica: «¡Compra YA el café #1 del Cauca con 20% de descuento!» vs «Conoce el origen…»', async () => {
    const bad = await engine.evaluate(
      input(TINTO, ['¡Compra YA el café #1 del Cauca con 20% de descuento!']),
    );
    const found = bad.findings.map((item) => item.code);
    expect(found).toEqual(
      expect.arrayContaining(['aggressive_tone', 'ungrounded_market_claim', 'invented_promotion']),
    );
    expect(bad.status).toBe('block');
    const good = await engine.evaluate(input(TINTO, ['Conoce el origen que acompaña cada taza.']));
    expect(good.status).toBe('pass');
    expect(good.score! - bad.score!).toBeGreaterThanOrEqual(20);
  });
});

const strategy: CampaignStrategy = {
  id: ID,
  workspaceId: ID,
  campaignId: ID,
  version: 1,
  strategicProblem: 'El origen no se percibe en el lineal.',
  strategicOpportunity: 'Contar el recorrido del grano.',
  insight: 'Quien compra café de especialidad quiere saber de dónde viene.',
  insightType: 'brand_derived',
  bigIdea: 'Cada taza empieza en una finca con nombre.',
  concept: 'Del origen a la mesa',
  campaignNarrative: 'El recorrido del grano desde la finca en Huila hasta la mesa, lote a lote.',
  keyMessage: 'El mismo origen de Huila en cada taza.',
  supportingMessages: ['Trazabilidad lote a lote.', 'Tostión semanal.'],
  valueProposition: null,
  callToAction: null,
  tone: ['cálido'],
  visualDirection: {
    mood: [],
    colors: [],
    materials: [],
    composition: [],
    photography: [],
    motion: [],
    avoid: [],
  },
  channels: ['Instagram'],
  contentPillars: [{ name: 'Origen', purpose: 'El recorrido del grano desde la finca.' }],
  rationale: 'Usa el origen como diferenciador.',
  brandDnaVersion: 1,
  generation: {
    provider: 'demo',
    model: 'demo',
    mode: 'demo',
    discardedDeliverables: 0,
    discardedClaims: 0,
    memoryKeys: [],
  },
  createdAt: new Date().toISOString(),
};

describe('Alineación con la campaña', () => {
  const withCampaign = (text: string): GuardianEvaluationInput => ({
    ...input(TINTO, [text]),
    resourceType: 'content_item',
    mode: 'content',
    campaign: { id: ID, name: 'Lanzamiento TINTO 500 g' },
    campaignStrategy: strategy,
  });

  it('«Proceso desde la finca hasta el empaque» se alinea mejor que «5 memes de lunes y café»', async () => {
    const a = await dimension(
      withCampaign('El recorrido del grano: proceso desde la finca hasta el empaque.'),
      'campaign_alignment',
    );
    const b = await dimension(withCampaign('5 memes de lunes y café'), 'campaign_alignment');
    expect(a.applicable).toBe(true);
    expect(a.score!).toBeGreaterThan(b.score!);
    expect(b.status).toBe('warning');
  });
});

describe('Dirección visual estructurada (texto, nunca imágenes)', () => {
  it('cyberpunk, neón y cromo frente a madera, kraft y luz cálida → hallazgo fuerte', async () => {
    const result = await engine.evaluate({
      ...input(TINTO, ['Campaña de lanzamiento']),
      resourceType: 'campaign',
      mode: 'campaign',
      resource: {
        ...input(TINTO, ['Campaña de lanzamiento']).resource,
        visualDirection: {
          mood: ['cyberpunk'],
          colors: ['neón azul'],
          materials: ['chrome', 'metálico'],
          composition: [],
          photography: [],
          motion: [],
          avoid: [],
        },
      },
    });
    const visual = result.findings.find((item) => item.code === 'visual_cold_tech_clash')!;
    expect(visual.severity).toBe('high');
    expect(visual.message).toMatch(/no se ha analizado ninguna imagen/);
    expect(result.findings.map((item) => item.code)).toContain('visual_restriction');
  });

  it('una revisión de texto no evalúa dirección visual (no aplica, no penaliza)', async () => {
    const visual = await dimension(
      input(TINTO, ['Conoce el origen que acompaña cada taza.']),
      'visual_direction',
    );
    expect(visual).toMatchObject({ applicable: false, score: null });
  });
});

describe('Referencias controladas y score', () => {
  /** Un proveedor que cita referencias inventadas (BRAND_RULE_999) y una real. */
  class CitingProvider extends DemoProvider {
    override async generateStructuredOutput<T>(
      ...args: Parameters<AIProvider['generateStructuredOutput']>
    ) {
      const [request] = args;
      if (request.schemaName !== 'guardian_semantic_evaluation')
        return super.generateStructuredOutput<T>(...(args as [never]));
      const data: GeneratedGuardianEvaluation = {
        dimensions: [],
        findings: [
          {
            dimension: 'identity',
            severity: 'high',
            code: 'invented_rule',
            title: 'Regla inventada',
            message: 'Contradice una regla que no existe en el ADN.',
            evidenceRefs: ['RESOURCE_TEXT_1'],
            brandRefs: ['BRAND_RULE_999'],
            recommendation: 'Nada.',
          },
          {
            dimension: 'identity',
            severity: 'medium',
            code: 'grounded_rule',
            title: 'Se aleja del tono',
            message: 'El texto se aleja del tono cálido de la marca.',
            evidenceRefs: ['RESOURCE_TEXT_1', 'RESOURCE_TEXT_999'],
            brandRefs: ['BRAND_TONE_1'],
            recommendation: 'Habla con más cercanía.',
          },
        ],
      };
      return {
        data: data as T,
        provider: 'test',
        model: 'test',
        mode: 'ai' as const,
        latencyMs: 1,
      };
    }
  }

  it('descarta la evidencia que cita referencias inexistentes y el hallazgo sin fundamento', async () => {
    const citing = createGuardianEngine({ ai: new CitingProvider(), logger });
    const result = await citing.evaluate(input(TINTO, ['Un texto cualquiera para revisar.']));
    const found = result.findings.map((item) => item.code);
    expect(found).not.toContain('invented_rule');
    const grounded = result.findings.find((item) => item.code === 'grounded_rule')!;
    expect(grounded.blocking).toBe(false);
    expect(grounded.evidence).toHaveLength(1);
    expect(grounded.brandEvidence[0]).toMatch(/ADN → Comunicación → tono/);
    expect(result.generation.aiUsed).toBe(true);
  });

  it('mismos hallazgos → mismo score (no depende de la redacción de la IA)', async () => {
    const value = input(TINTO, ['¡Compra YA el café #1 del Cauca con 20% de descuento!']);
    const [a, b] = await Promise.all([engine.evaluate(value), engine.evaluate(value)]);
    expect(a.score).toBe(b.score);
    const findings = a.findings.map((finding) => ({
      ...finding,
      title: 'otro texto',
      message: 'otra redacción',
    }));
    const again = aggregate(
      a.dimensions.filter((d) => d.applicable).map((d) => d.dimension),
      a.dimensions.map((d) => d.dimension),
      findings,
      {},
    );
    expect(again.score).toBe(a.score);
  });

  it('penalizaciones documentadas por severidad', () => {
    const finding = (severity: 'low' | 'medium' | 'high' | 'critical') =>
      ({ severity, blocking: false, overridden: false }) as Parameters<
        typeof dimensionScore
      >[0][number];
    expect(dimensionScore([])).toBe(100);
    expect(dimensionScore([finding('low')])).toBe(95);
    expect(dimensionScore([finding('medium'), finding('high')])).toBe(63);
    expect(dimensionScore([finding('critical'), finding('critical'), finding('critical')])).toBe(0);
  });
});

describe('Corrección demo (una pasada, nunca inventa)', () => {
  it('«¡Compra YA el café #1 del Cauca con 20% de descuento!» conserva el mensaje sin claims', async () => {
    const { correctDemoText } = await import('../src/ai/providers/demoGuardian.js');
    const { corrected } = correctDemoText(
      '¡Compra YA el café #1 del Cauca con 20% de descuento!',
      [
        { kind: 'soften_urgency', match: 'compra ya' },
        { kind: 'normalize_shouting', match: '' },
        { kind: 'remove_phrase', match: 'descuento' },
        { kind: 'remove_claim', match: '#1' },
        { kind: 'remove_proper_name', match: 'Cauca' },
      ],
      ['Trazabilidad lote a lote'],
    );
    expect(corrected).toMatch(/^Descubre el café/);
    expect(corrected).not.toMatch(/descuento|%|#1|Cauca|YA|¡|!/);
    expect(corrected).toMatch(/trazabilidad lote a lote/);
  });

  it('una promoción inventada se quita, no se cambia por otra', async () => {
    const { correctDemoText } = await import('../src/ai/providers/demoGuardian.js');
    const { corrected } = correctDemoText(
      'Llévate TINTO con 20% de descuento.',
      [{ kind: 'remove_phrase', match: '20% de' }],
      [],
    );
    expect(corrected).toBe('Llévate TINTO.');
  });
});
