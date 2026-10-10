import {
  availablePixelIntents,
  PixelCommandEntitiesSchema,
  pixelIntentAvailable,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { interpretPixelRequest } from '../src/ai/pixelCommandRules.js';
import {
  matchCampaigns,
  periodFor,
  planCommand,
  requiredFormats,
  type PlanningState,
} from '../src/modules/pixel-command/pixelCommand.planner.js';
import type { PixelKnownContext } from '../src/modules/pixel-command/pixelContext.resolver.js';
import { mergeEntities } from '../src/modules/pixel-command/pixelIntent.resolver.js';

const enterprise = availablePixelIntents('enterprise');
const personal = availablePixelIntents('personal');
const interpret = (text: string, intents = enterprise) => interpretPixelRequest(text, intents);

describe('Intenciones (reglas)', () => {
  it.each([
    ['Necesito lanzar un producto', 'create_campaign'],
    ['Quiero una campaña de Amor y Amistad para TINTO.', 'create_campaign'],
    ['Necesito tres Reels esta semana', 'plan_content'],
    ['Necesito contenido para el lanzamiento de 500 g esta semana.', 'plan_content'],
    ['Organiza este proyecto', 'organize_project'],
    ['¿Cómo vamos?', 'work_status'],
    ['¿Cómo vamos con el lanzamiento?', 'work_status'],
    ['¿Qué debería publicar?', 'creative_advice'],
    ['Dame tres ideas de contenido', 'creative_advice'],
    ['Crea tareas para el lanzamiento: grabar el reel y editar las fotos', 'create_tasks'],
    ['Guarda una pieza sobre el tueste del café', 'create_content'],
    ['Hola', 'unknown'],
  ])('«%s» → %s', (text, intent) => {
    expect(interpret(text).intent).toBe(intent);
  });

  it('Personal nunca crea campañas: lanzar algo es planear contenido', () => {
    expect(pixelIntentAvailable('personal', 'create_campaign')).toBe(false);
    const result = interpret('Quiero lanzar mi portafolio en Instagram', personal);
    expect(result.intent).toBe('plan_content');
    expect(result.entities.topic).toBe('portafolio');
  });

  it('extrae solo lo que el usuario dijo (nunca tono, colores ni audiencia)', () => {
    const { entities } = interpret('Quiero lanzar TINTO 500 g la próxima semana en Instagram.');
    expect(entities).toMatchObject({
      productOrService: 'TINTO 500 g',
      timeframe: 'next_week',
      platforms: ['instagram'],
      campaignType: 'launch',
      includeContent: true,
    });
    expect(Object.keys(entities)).not.toContain('tone');
  });

  it('un producto genérico no es un producto: falta saber cuál', () => {
    const result = interpret('Quiero lanzar el nuevo producto.');
    expect(result.entities.productOrService).toBeNull();
    expect(result.missingRequiredInformation).toEqual(['productOrService']);
  });

  it('formatos y exclusiones: "tres Reels", "sin Stories"', () => {
    expect(interpret('Necesito tres Reels esta semana').entities).toMatchObject({
      formats: ['reel'],
      pieceCount: 3,
      timeframe: 'this_week',
    });
    expect(interpret('Mejor solo Instagram y no quiero Stories.').entities).toMatchObject({
      platforms: ['instagram'],
      excludedFormats: ['story'],
    });
  });
});

describe('Ajustes: mezcla determinista', () => {
  const base = PixelCommandEntitiesSchema.parse({
    platforms: ['instagram', 'tiktok'],
    formats: ['reel', 'story'],
  });

  it('"Quita Stories" excluye el formato y conserva el resto', () => {
    const merged = mergeEntities(base, interpret('Quita Stories.').entities);
    expect(merged.formats).toEqual(['reel']);
    expect(merged.excludedFormats).toEqual(['story']);
    expect(merged.platforms).toEqual(['instagram', 'tiktok']);
  });

  it('"Solo Instagram" reemplaza las plataformas', () => {
    expect(mergeEntities(base, interpret('Mejor solo Instagram').entities).platforms).toEqual([
      'instagram',
    ]);
  });
});

describe('Periodos en el día local del workspace', () => {
  it('esta semana, la próxima y sin plazo', () => {
    // 2026-10-14 es miércoles.
    expect(periodFor('this_week', '2026-10-14')).toMatchObject({
      startDate: '2026-10-14',
      endDate: '2026-10-18',
    });
    expect(periodFor('next_week', '2026-10-14')).toMatchObject({
      startDate: '2026-10-19',
      endDate: '2026-10-25',
      days: 7,
    });
    expect(periodFor(null, '2026-10-14')).toMatchObject({ startDate: '2026-10-15', days: 7 });
    expect(periodFor('next_month', '2026-10-14')).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
  });

  it('excluir un formato deja los demás de la plataforma', () => {
    const entities = PixelCommandEntitiesSchema.parse({ excludedFormats: ['story'] });
    expect(requiredFormats(entities, ['instagram'])).toEqual(['reel', 'carousel', 'photo']);
  });
});

const tintoContext: PixelKnownContext = {
  workspaceType: 'enterprise',
  ownerName: 'TINTO',
  dnaPlatforms: [],
  campaigns: [
    {
      id: '6ac93cc3a738fe62abe5b039',
      name: 'Lanzamiento TINTO 500 g',
      productOrService: 'Café TINTO 500 g',
      objective: 'Presentar la nueva presentación de 500 g',
      channels: ['Instagram', 'Punto de venta'],
      status: 'active',
      hasStrategy: true,
      updatedAt: new Date(),
    },
  ],
  projects: [],
};

function state(text: string, overrides: Partial<PlanningState> = {}): PlanningState {
  const result = interpret(text);
  return {
    intent: result.intent,
    request: text,
    entities: result.entities,
    context: tintoContext,
    today: '2026-10-14',
    tzOffset: 300,
    chosenCampaignId: null,
    noCampaign: false,
    ...overrides,
  };
}

describe('MissingInformationResolver: pregunta solo lo indispensable', () => {
  it('"Haz una campaña": pregunta el objetivo, nunca el tono', () => {
    const outcome = planCommand(state('Haz una campaña'));
    expect(outcome.kind).toBe('question');
    if (outcome.kind !== 'question') return;
    expect(outcome.question).not.toMatch(/tono|colores|personalidad|audiencia|arquetipo/i);
  });

  it('"Quiero lanzar el nuevo producto": UNA pregunta relevante', () => {
    const outcome = planCommand(state('Quiero lanzar el nuevo producto.'));
    expect(outcome).toEqual({
      kind: 'question',
      field: 'productOrService',
      question: '¿Qué producto o servicio vamos a lanzar?',
    });
  });

  it('una solicitud clara llega a propuesta sin preguntas ni formularios', () => {
    const outcome = planCommand(state('Quiero lanzar TINTO 500 g la próxima semana en Instagram.'));
    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.steps.map((step) => step.type)).toEqual([
      'generate_campaign',
      'generate_content_plan',
    ]);
    // Lenguaje humano: sin nombres internos.
    expect(JSON.stringify([outcome.summary, outcome.proposal, outcome.creates])).not.toMatch(
      /ContentPlan|CampaignStrategy|ContentPlanItem|Project\b|Task\b/,
    );
  });

  it('"Una campaña de Amor y Amistad" avanza sin preguntar por descuentos', () => {
    const outcome = planCommand(state('Quiero una campaña de Amor y Amistad para TINTO.'));
    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.proposal.join(' ')).toMatch(/Sin descuentos/);
    expect(outcome.steps).toHaveLength(1);
  });

  it('contenido "para el lanzamiento de 500 g" usa esa campaña y sus canales', () => {
    const outcome = planCommand(
      state('Necesito contenido para el lanzamiento de 500 g esta semana.'),
    );
    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.campaignId).toBe(tintoContext.campaigns[0]!.id);
    expect(outcome.steps[0]!.params).toMatchObject({
      platforms: ['instagram'],
      campaignId: tintoContext.campaigns[0]!.id,
      startDate: '2026-10-14',
      endDate: '2026-10-18',
    });
  });

  it('sin plataformas en ningún sitio: pregunta una sola cosa', () => {
    const outcome = planCommand(
      state('Necesito tres Reels esta semana', {
        context: { ...tintoContext, campaigns: [] },
      }),
    );
    expect(outcome).toMatchObject({ kind: 'question', field: 'platforms' });
  });

  it('una campaña de otro Pixel no se encuentra: el plan parte del ADN', () => {
    expect(matchCampaigns(tintoContext.campaigns, 'INVENTIA', 'x')).toEqual([]);
    const outcome = planCommand(state('Haz contenido usando la campaña de INVENTIA en Instagram'));
    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.campaignId).toBeNull();
    expect(outcome.understood.join(' ')).toMatch(/No encontré una campaña «INVENTIA»/);
  });
});

describe('Redacción de la propuesta', () => {
  it('"Entendí que quieres una campaña de…" (no "quieres campaña de…")', () => {
    const outcome = planCommand(state('Quiero una campaña de Amor y Amistad para TINTO.'));
    expect(outcome.kind === 'proposal' && outcome.summary).toMatch(
      /^Entendí que quieres una campaña de Amor y Amistad para TINTO\./,
    );
  });
});
