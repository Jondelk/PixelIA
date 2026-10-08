import {
  PersonalOnboardingSchema,
  type ContentItem,
  type GeneratedContentPlan,
  type GeneratedContentPlanItem,
  type Project,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AIProviderError, extractPlanningPayload, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import {
  buildVocabulary,
  formatFromText,
  frequencyFromText,
  groundedSentences,
  isNearDuplicate,
  platformFromText,
  spreadDays,
  unfoundedClaims,
} from '../src/modules/content-plans/contentPlanning.grounding.js';
import {
  createContentPlanningEngine,
  type ContentPlanningInput,
} from '../src/modules/content-plans/contentPlanning.engine.js';
import { generatePersonalDnaContent } from '../src/modules/personal/personalDna.generator.js';
import { creativeDirector, photographer, streamer } from './fixtures/personal.js';
import { jaccard } from './support/similarity.js';

const logger = createLogger({ level: 'silent', format: 'json' });
const dnaOf = (answers: typeof photographer) =>
  generatePersonalDnaContent(PersonalOnboardingSchema.parse(answers));

const NOW = '2026-10-07T15:00:00.000Z';
const project = (overrides: Partial<Project>): Project => ({
  id: '64b7f0c2a1b2c3d4e5f60010',
  workspaceId: '64b7f0c2a1b2c3d4e5f60001',
  name: 'Videoclip musical',
  description: 'Dirección y edición de un videoclip para una banda local',
  type: 'creative',
  status: 'active',
  priority: 'high',
  goals: ['entregar el corte final'],
  startDate: null,
  dueDate: null,
  progress: 0,
  stats: { tasks: 0, completedTasks: 0, contentItems: 0 },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

function input(answers: typeof photographer, overrides: Partial<ContentPlanningInput> = {}) {
  return {
    workspaceId: '64b7f0c2a1b2c3d4e5f60001',
    personalDna: dnaOf(answers),
    activeProjects: [],
    recentContent: [],
    previousProposals: [],
    requestedPeriod: { startDate: '2026-10-12', endDate: '2026-10-18' },
    desiredFrequency: 3,
    tzOffset: 300,
    ...overrides,
  } satisfies ContentPlanningInput;
}

/** Proveedor "real" controlado: devuelve el plan indicado y guarda el prompt recibido. */
function scripted(output: GeneratedContentPlan | Error): AIProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    name: 'scripted',
    model: 'scripted-1',
    mode: 'ai',
    prompts,
    generateText: () => Promise.reject(new Error('no usado')),
    async generateStructuredOutput(request) {
      prompts.push(request.prompt);
      if (output instanceof Error) throw output;
      return {
        data: request.schema.parse(output),
        provider: 'scripted',
        model: 'scripted-1',
        mode: 'ai',
        latencyMs: 1,
      };
    },
  };
}

const item = (overrides: Partial<GeneratedContentPlanItem> = {}): GeneratedContentPlanItem => ({
  title: 'Cómo preparo una sesión de retrato con luz natural',
  concept: 'El proceso previo a una sesión editorial, de la luz al encuadre.',
  rationale: 'Muestra tu criterio y conecta con tu objetivo de vender sesiones premium.',
  objective: 'Vender sesiones premium',
  audience: ['Profesionales y marcas personales que quieren retratos de alto nivel'],
  platform: 'instagram',
  format: 'carousel',
  pillar: 'Proceso',
  angle: 'process',
  hook: 'La luz se decide antes de llegar.',
  suggestedAngle: null,
  suggestedDate: '2026-10-13',
  projectId: null,
  ...overrides,
});

const plan = (
  items: GeneratedContentPlanItem[],
  strategySummary?: string,
): GeneratedContentPlan => ({
  strategySummary:
    strategySummary ??
    'Para estas semanas propondría priorizar tu proceso y el detrás de cámara. Todo apunta a vender sesiones premium.',
  pillars: [
    { name: 'Proceso', rationale: 'Tu objetivo de contenido es mostrar tu proceso.' },
    { name: 'Detrás de cámara', rationale: 'Es uno de tus temas.' },
  ],
  items,
});

describe('Reglas del planner', () => {
  it('mapea plataformas y formatos del ADN (texto libre) a los enums de ContentItem', () => {
    expect(
      ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Twitch', 'X'].map(platformFromText),
    ).toEqual(['instagram', 'tiktok', 'youtube', 'linkedin', 'other', 'x']);
    expect(
      ['reels', 'carruseles', 'stories', 'fotografía', 'video largo', 'pintura'].map(
        formatFromText,
      ),
    ).toEqual(['reel', 'carousel', 'story', 'photo', 'long_video', null]);
  });

  it('entiende la frecuencia del ADN y si no, devuelve null (se usa el valor por defecto)', () => {
    expect(frequencyFromText('3 publicaciones por semana')).toBe(3);
    expect(frequencyFromText('dos a la semana')).toBe(2);
    expect(frequencyFromText('directo diario')).toBe(7);
    expect(frequencyFromText('1 al día')).toBe(7);
    expect(frequencyFromText('8 al mes')).toBe(2);
    expect(frequencyFromText('cuando puedo')).toBeNull();
    expect(frequencyFromText(null)).toBeNull();
  });

  it('reparte fechas dentro del periodo', () => {
    const days = [
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ];
    expect(spreadDays(days, 3)).toEqual(['2026-10-13', '2026-10-15', '2026-10-17']);
  });

  it('detecta datos inventados: métricas, nombres propios y afirmaciones sobre la audiencia', () => {
    const vocabulary = buildVocabulary([dnaOf(photographer)]);
    expect(unfoundedClaims('Aprovecha tu comunidad de 50.000 seguidores', vocabulary)).toContain(
      '50.000 seguidores',
    );
    expect(unfoundedClaims('Cuenta cómo trabajaste con tu cliente Nike', vocabulary)).toContain(
      'Nike',
    );
    expect(
      unfoundedClaims('Tus 10 años de experiencia lo avalan', vocabulary).length,
    ).toBeGreaterThan(0);
    expect(
      unfoundedClaims('Tu audiencia prefiere los carruseles', vocabulary).length,
    ).toBeGreaterThan(0);
    // Propuestas en condicional y palabras del ADN sí valen.
    expect(
      unfoundedClaims(
        'Para tu audiencia definida, propondría un carrusel sobre luz natural en Instagram.',
        vocabulary,
      ),
    ).toEqual([]);
    expect(unfoundedClaims('Tres ideas sobre el retoque para revistas', vocabulary)).toEqual([]);
    expect(
      groundedSentences('Mostrar tu proceso. Tus 20.000 seguidores lo piden.', vocabulary),
    ).toBe('Mostrar tu proceso.');
  });

  it('detecta duplicación evidente, no originalidad absoluta', () => {
    expect(
      isNearDuplicate('Cómo preparo una sesión de retrato', ['como preparo una sesion de retrato']),
    ).toBe(true);
    expect(
      isNearDuplicate('El retoque de una sesión editorial', ['Cómo preparo una sesión de retrato']),
    ).toBe(false);
  });
});

describe('ContentPlanningEngine', () => {
  it('personas distintas, mismos parámetros → planes claramente distintos', async () => {
    const engine = createContentPlanningEngine({ ai: new DemoProvider(), logger });
    const [a, b] = await Promise.all([
      engine.plan(input(photographer)),
      engine.plan(input(streamer)),
    ]);
    expect(a.items).toHaveLength(3);
    expect(b.items).toHaveLength(3);
    // Plataformas solo de su ADN: la fotógrafa no recibe TikTok; el streamer no recibe LinkedIn.
    expect(a.items.every((entry) => ['instagram', 'linkedin'].includes(entry.platform))).toBe(true);
    expect(b.items.every((entry) => ['other', 'tiktok', 'youtube'].includes(entry.platform))).toBe(
      true,
    );
    // Formatos preferidos de cada uno.
    expect(a.items.every((entry) => ['carousel', 'photo'].includes(entry.format))).toBe(true);
    const text = (proposal: typeof a) =>
      [
        proposal.strategySummary,
        ...proposal.items.flatMap((entry) => [entry.title, entry.rationale]),
      ].join(' ');
    // El demo usa plantillas fijas ("Lo esencial sobre…"), que suben el solapamiento general: se
    // exige además que no compartan ningún título y que cada plan hable de lo suyo.
    expect(jaccard(text(a), text(b))).toBeLessThan(0.5);
    const titlesA = a.items.map((entry) => entry.title);
    expect(b.items.some((entry) => titlesA.includes(entry.title))).toBe(false);
    expect(text(a)).not.toMatch(/comunidad|streaming|juegos/);
    expect(text(b)).not.toMatch(/retrato|sesiones premium|retoque/);
    expect(a.pillars.map((pillar) => pillar.name)).not.toEqual(
      b.pillars.map((pillar) => pillar.name),
    );
    expect(text(a)).toMatch(/sesiones premium/);
    expect(text(b)).toMatch(/comunidad/);
    // Fechas dentro del periodo, cada propuesta con su porqué.
    for (const entry of [...a.items, ...b.items]) {
      expect(entry.scheduledFor.getTime()).toBeGreaterThanOrEqual(
        Date.parse('2026-10-12T00:00:00Z'),
      );
      expect(entry.scheduledFor.getTime()).toBeLessThan(Date.parse('2026-10-19T12:00:00Z'));
      expect(entry.rationale.length).toBeGreaterThan(20);
    }
  });

  it('usa los proyectos reales como fuente y los envía al modelo', async () => {
    const videoclip = project({});
    const demo = await createContentPlanningEngine({ ai: new DemoProvider(), logger }).plan(
      input(creativeDirector, { activeProjects: [videoclip] }),
    );
    expect(demo.items.some((entry) => entry.projectId === videoclip.id)).toBe(true);
    expect(demo.items.find((entry) => entry.projectId)?.title).toContain('Videoclip musical');
    expect(demo.strategySummary).toMatch(/proyectos activos/);

    // Con un modelo: el contexto incluye el proyecto y su id se conserva solo si es real.
    const ai = scripted(
      plan([
        item({
          projectId: videoclip.id,
          title: 'Del guion al corte final del videoclip',
          platform: 'instagram',
          format: 'reel',
        }),
        item({
          projectId: '64b7f0c2a1b2c3d4e5f6ffff',
          title: 'Una mirada a la dirección de arte',
          hook: 'El criterio antes que la herramienta.',
          suggestedDate: '2026-10-15',
          format: 'reel',
        }),
      ]),
    );
    const proposal = await createContentPlanningEngine({ ai, logger }).plan(
      input(creativeDirector, { activeProjects: [videoclip] }),
    );
    const payload = extractPlanningPayload(ai.prompts[0]!);
    expect(payload?.projects).toEqual([
      expect.objectContaining({ id: videoclip.id, name: 'Videoclip musical' }),
    ]);
    expect(payload?.request.allowedPlatforms).toEqual(['instagram']);
    expect(payload?.request.preferredFormats).toEqual(['reel', 'carousel', 'story']);
    expect(proposal.items.map((entry) => entry.projectId)).toEqual([videoclip.id, null]);
  });

  it('funciona sin proyectos ni historial (cuentas nuevas) a partir del ADN', async () => {
    const proposal = await createContentPlanningEngine({ ai: new DemoProvider(), logger }).plan(
      input(creativeDirector),
    );
    expect(proposal.items.length).toBe(3);
    expect(proposal.items.every((entry) => entry.projectId === null)).toBe(true);
    expect(proposal.strategySummary).toMatch(/Sin proyectos activos/);
  });

  it('rechaza datos no fundamentados: seguidores inventados, clientes inventados', async () => {
    const ai = scripted(
      plan(
        [
          item({
            title: 'Lo que aprendí con tu comunidad de 50.000 seguidores',
            suggestedDate: '2026-10-12',
          }),
          item({
            title: 'El rodaje con tu cliente Nike',
            suggestedDate: '2026-10-14',
            hook: 'Detrás de una sesión.',
          }),
          item({
            title: 'El retoque que no se ve',
            suggestedDate: '2026-10-16',
            hook: 'Antes y después.',
            rationale: 'Tu audiencia prefiere los carruseles de retoque.',
          }),
          item({ suggestedDate: '2026-10-17' }),
        ],
        'Vamos a priorizar tu proceso. Con tus 50.000 seguidores será fácil. Todo apunta a vender sesiones premium.',
      ),
    );
    const proposal = await createContentPlanningEngine({ ai, logger }).plan(input(photographer));
    expect(proposal.items.map((entry) => entry.title)).toEqual([
      'Cómo preparo una sesión de retrato con luz natural',
    ]);
    expect(proposal.discardedItems).toBe(3);
    expect(proposal.strategySummary).not.toMatch(/50\.000/);
    expect(proposal.strategySummary).toMatch(/proceso/);
  });

  it('solo plataformas permitidas, sin repetir contenido reciente y con fechas del periodo', async () => {
    const recent = {
      title: 'Cómo preparo una sesión de retrato con luz natural',
      hook: null,
    } as ContentItem;
    const ai = scripted(
      plan([
        item({ platform: 'tiktok', title: 'Un reto de retrato en vertical' }),
        item({}),
        item({
          title: 'Antes y después del retoque',
          hook: 'Lo que cambia un retoque.',
          suggestedDate: '2027-01-01',
        }),
      ]),
    );
    const proposal = await createContentPlanningEngine({ ai, logger }).plan(
      input(photographer, { recentContent: [recent] }),
    );
    expect(proposal.items.map((entry) => entry.title)).toEqual(['Antes y después del retoque']);
    expect(proposal.discardedItems).toBe(2);
    // Fecha fuera del periodo → se reparte dentro (mediodía local de Bogotá).
    expect(proposal.items[0]!.scheduledFor.toISOString()).toBe('2026-10-15T17:00:00.000Z');
  });

  it('un formato alternativo cabe, pero no domina el plan; el ángulo tampoco', async () => {
    const titles = [
      'Luz de ventana',
      'Retrato en exteriores',
      'Revistas impresas',
      'Sesiones en estudio',
      'Paleta marfil',
      'El primer encuadre',
    ];
    const ai = scripted(
      plan(
        titles.map((title, index) =>
          item({
            title,
            hook: `${title}.`,
            format: 'long_video',
            angle: index < 4 ? 'education' : 'opinion',
            suggestedDate: null,
          }),
        ),
      ),
    );
    const proposal = await createContentPlanningEngine({ ai, logger }).plan(
      input(photographer, { desiredFrequency: 6 }),
    );
    expect(proposal.items.length).toBe(2); // 6 piezas pedidas → máx. 6/3 = 2 alternativas
  });

  it('frecuencia: la pedida, la del ADN o el valor por defecto (3/semana)', async () => {
    const engine = createContentPlanningEngine({ ai: new DemoProvider(), logger });
    const fromDna = await engine.plan(
      input(photographer, {
        desiredFrequency: undefined,
        requestedPeriod: { startDate: '2026-10-12', endDate: '2026-10-25' },
      }),
    );
    expect([fromDna.frequencySource, fromDna.items.length]).toEqual(['personal_dna', 6]);
    const dna = dnaOf(photographer);
    dna.contentIdentity.frequencyPreference = null;
    const fallback = await engine.plan({
      ...input(photographer, { desiredFrequency: undefined }),
      personalDna: dna,
    });
    expect([fallback.frequencySource, fallback.frequencyPerWeek, fallback.items.length]).toEqual([
      'default',
      3,
      3,
    ]);
  });

  it('sin plataformas en el ADN ni en la petición no genera nada', async () => {
    const dna = dnaOf(photographer);
    dna.contentIdentity.platforms = [];
    await expect(
      createContentPlanningEngine({ ai: new DemoProvider(), logger }).plan({
        ...input(photographer),
        personalDna: dna,
      }),
    ).rejects.toMatchObject({ kind: 'platforms_missing' });
  });

  it('sin proveedor disponible no inventa un calendario: error claro', async () => {
    const down = scripted(new AIProviderError('unavailable', 'sin red'));
    await expect(
      createContentPlanningEngine({ ai: down, logger }).plan(input(photographer)),
    ).rejects.toMatchObject({
      kind: 'unavailable',
    });
    const allInvented = scripted(
      plan([item({ title: 'Tu cliente Nike y sus 3 millones de fans' })]),
    );
    await expect(
      createContentPlanningEngine({ ai: allInvented, logger }).plan(input(photographer)),
    ).rejects.toMatchObject({
      kind: 'failed',
    });
  });
});
