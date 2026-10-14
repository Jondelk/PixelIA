import {
  PersonalOnboardingSchema,
  type ContentItem,
  type DailyBriefGeneration,
  type PersonalDnaContent,
  type Project,
  type Task,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AIProviderError, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { contentHealth } from '../src/modules/daily-director/contentHealth.js';
import { analyzeDay, focusModeOf } from '../src/modules/daily-director/dailyAnalysis.js';
import type { DailyRawData } from '../src/modules/daily-director/dailyData.collector.js';
import {
  createDailyDirectorEngine,
  dailyClaims,
} from '../src/modules/daily-director/dailyDirector.engine.js';
import { deterministicBrief } from '../src/modules/daily-director/dailyFallback.js';
import { dayContext, daysUntil } from '../src/modules/daily-director/dailyTime.js';
import { scoreTask } from '../src/modules/daily-director/priorityScorer.js';
import { projectHealth } from '../src/modules/daily-director/projectHealth.js';
import { buildVocabulary } from '../src/modules/content-plans/contentPlanning.grounding.js';
import { generatePersonalDnaContent } from '../src/modules/personal/personalDna.generator.js';
import { creativeDirector } from './fixtures/personal.js';

const logger = createLogger({ level: 'silent', format: 'json' });
const TZ = 'America/Bogota';
// 8 oct 2026, 15:00 en Bogotá (20:00 UTC).
const NOW = new Date('2026-10-08T20:00:00.000Z');
const DAY = dayContext(NOW, TZ);
const WS = '64b7f0c2a1b2c3d4e5f60001';
let seq = 0;
const oid = () => `64b7f0c2a1b2c3d4e5f6${String(++seq).padStart(4, '0')}`;
/** Mediodía de Bogotá de un día relativo a hoy (convención de Operations). */
const dayAt = (offset: number) => new Date(Date.UTC(2026, 9, 8 + offset, 17)).toISOString();
const ISO = NOW.toISOString();

const task = (overrides: Partial<Task> = {}): Task => ({
  id: oid(),
  workspaceId: WS,
  projectId: null,
  title: 'Tarea',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  estimatedMinutes: null,
  tags: [],
  source: 'manual',
  completedAt: null,
  createdAt: ISO,
  updatedAt: ISO,
  ...overrides,
});

const project = (overrides: Partial<Project> = {}): Project => ({
  id: oid(),
  workspaceId: WS,
  campaignId: null,
  name: 'Proyecto',
  description: null,
  type: 'general',
  status: 'active',
  priority: 'medium',
  goals: [],
  startDate: null,
  dueDate: null,
  progress: 0,
  stats: { tasks: 0, completedTasks: 0, contentItems: 0 },
  createdAt: ISO,
  updatedAt: ISO,
  ...overrides,
});

const content = (overrides: Partial<ContentItem> = {}): ContentItem => ({
  id: oid(),
  workspaceId: WS,
  campaignId: null,
  projectId: null,
  title: 'Pieza',
  concept: null,
  objective: null,
  platform: 'instagram',
  format: 'reel',
  status: 'idea',
  hook: null,
  caption: null,
  script: null,
  notes: null,
  scheduledFor: null,
  publishedAt: null,
  tags: [],
  source: 'manual',
  createdAt: ISO,
  updatedAt: ISO,
  ...overrides,
});

const baseDna = () => generatePersonalDnaContent(PersonalOnboardingSchema.parse(creativeDirector));

function raw(overrides: Partial<DailyRawData> = {}): DailyRawData {
  const openTasks = overrides.openTasks ?? [];
  return {
    personalDna: baseDna(),
    personalDnaVersion: 1,
    projects: [],
    openTasks,
    openTaskTotal: openTasks.length,
    recentCompleted: [],
    content: [],
    activeContentTotal: overrides.content?.length ?? 0,
    plans: [],
    planItems: [],
    snapshotAt: NOW,
    fingerprint: { openTasks: openTasks.length, activeContent: 0 },
    ...overrides,
  };
}

/** Proveedor "real" controlado: devuelve lo indicado y cuenta llamadas. */
function scripted(output: (refs: string[]) => DailyBriefGeneration | Error) {
  const provider: AIProvider & { calls: number } = {
    name: 'scripted',
    model: 'scripted-1',
    mode: 'ai',
    calls: 0,
    generateText: () => Promise.reject(new Error('no usado')),
    async generateStructuredOutput(request) {
      provider.calls += 1;
      const refs = [...request.prompt.matchAll(/"ref":"([A-Z]+_\d+)"/g)].map((match) => match[1]!);
      const result = output(refs);
      if (result instanceof Error) throw result;
      return {
        data: request.schema.parse(result),
        provider: 'scripted',
        model: 'scripted-1',
        mode: 'ai',
        latencyMs: 3,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
  return provider;
}

describe('PriorityScorer', () => {
  it('vencida + alta queda por encima de alta para la semana próxima', () => {
    const a = scoreTask(task({ priority: 'high', dueDate: dayAt(-2) }), DAY, new Map());
    const b = scoreTask(task({ priority: 'high', dueDate: dayAt(7) }), DAY, new Map());
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.urgency).toBe('critical');
    expect(b.urgency).toBe('medium');
    expect(a.signals.map((signal) => signal.text)).toEqual([
      'Venció hace 2 días',
      'Es de prioridad alta',
    ]);
  });

  it('escala legible: hoy > mañana > próximas > sin fecha; baja sin fecha es baja', () => {
    const score = (overrides: Partial<Task>) => scoreTask(task(overrides), DAY, new Map()).score;
    expect(score({ dueDate: dayAt(0) })).toBeGreaterThan(score({ dueDate: dayAt(1) }));
    expect(score({ dueDate: dayAt(1) })).toBeGreaterThan(score({ dueDate: dayAt(3) }));
    expect(score({ dueDate: dayAt(3) })).toBeGreaterThan(score({}));
    expect(scoreTask(task({ priority: 'low' }), DAY, new Map()).urgency).toBe('low');
  });

  it('el proyecto en riesgo suma impacto', () => {
    const p = project({ name: 'Videoclip' });
    const map = new Map([
      [
        p.id,
        {
          name: p.name,
          health: {
            status: 'at_risk' as const,
            openTasks: 3,
            daysLeft: 1,
            stalledDays: null,
            reasons: [],
          },
        },
      ],
    ]);
    const withProject = scoreTask(task({ projectId: p.id }), DAY, map);
    expect(withProject.signals.map((signal) => signal.text)).toContain(
      'Forma parte de «Videoclip», que está en riesgo',
    );
    expect(withProject.score).toBeGreaterThan(scoreTask(task(), DAY, new Map()).score);
  });
});

describe('Fechas en la zona horaria del workspace', () => {
  it('vencida, hoy, mañana y próximas según el día local, no UTC', () => {
    expect(DAY.today).toBe('2026-10-08');
    expect(daysUntil(dayAt(-1), DAY)).toBe(-1);
    expect(daysUntil(dayAt(0), DAY)).toBe(0);
    expect(daysUntil(dayAt(1), DAY)).toBe(1);
    expect(daysUntil(dayAt(5), DAY)).toBe(5);
    // 9 oct 02:00 UTC = 8 oct 21:00 en Bogotá: sigue siendo HOY allí, aunque en UTC ya sea mañana.
    expect(daysUntil('2026-10-09T02:00:00.000Z', DAY)).toBe(0);
    expect(daysUntil('2026-10-09T02:00:00.000Z', dayContext(NOW, 'UTC'))).toBe(1);
    // En Madrid (UTC+2) a las 23:30 locales del 8, todavía es el 8.
    expect(dayContext(new Date('2026-10-08T21:30:00.000Z'), 'Europe/Madrid').today).toBe(
      '2026-10-08',
    );
  });
});

describe('ProjectHealth', () => {
  it('vence mañana con 3 tareas abiertas → en riesgo', () => {
    const health = projectHealth(
      project({ dueDate: dayAt(1), stats: { tasks: 3, completedTasks: 0, contentItems: 0 } }),
      ISO,
      DAY,
      NOW,
    );
    expect(health).toMatchObject({ status: 'at_risk', openTasks: 3, daysLeft: 1 });
    expect(health.reasons).toEqual(['Vence mañana y tiene 3 tareas abiertas']);
  });

  it('vence en 3 días con 1 abierta → atención; en 10 días con 5 → sana', () => {
    expect(
      projectHealth(
        project({ dueDate: dayAt(3), stats: { tasks: 1, completedTasks: 0, contentItems: 0 } }),
        ISO,
        DAY,
        NOW,
      ).status,
    ).toBe('attention');
    expect(
      projectHealth(
        project({ dueDate: dayAt(10), stats: { tasks: 5, completedTasks: 0, contentItems: 0 } }),
        ISO,
        DAY,
        NOW,
      ).status,
    ).toBe('healthy');
  });

  it('sin fecha límite no infiere riesgo; sin actividad en 14 días → atención (estancado)', () => {
    const noDeadline = project({ stats: { tasks: 9, completedTasks: 0, contentItems: 0 } });
    expect(projectHealth(noDeadline, ISO, DAY, NOW).status).toBe('healthy');
    const old = new Date(NOW.getTime() - 20 * 86_400_000).toISOString();
    expect(projectHealth(project({ updatedAt: old }), old, DAY, NOW)).toMatchObject({
      status: 'attention',
      stalledDays: 20,
    });
    expect(
      projectHealth(project({ status: 'planned', updatedAt: old }), old, DAY, NOW).status,
    ).toBe('healthy');
  });
});

describe('ContentHealth', () => {
  it('detecta lo previsto para ayer, lo listo y la falta de contenido previsto', () => {
    const late = content({ title: 'Reel tardío', status: 'ready', scheduledFor: dayAt(-1) });
    const health = contentHealth([late], [], DAY);
    expect(health.overdue.map((item) => item.title)).toEqual(['Reel tardío']);
    expect(health.readyUnpublished).toHaveLength(1);
    expect(contentHealth([content({ status: 'idea' })], [], DAY).noPlannedContent).toBe(true);
  });

  it('la falta de contenido solo es un aviso si el contenido le importa a la persona', () => {
    const relevant = analyzeDay(raw({ openTasks: [task({ title: 'Algo' })] }), TZ, NOW);
    expect(relevant.warnings.map((warning) => warning.type)).toContain('content_gap');
    const dna: PersonalDnaContent = baseDna();
    dna.supportNeeds.wantsHelpWith = ['proyectos'];
    dna.goals.content = [];
    const notRelevant = analyzeDay(
      raw({ personalDna: dna, openTasks: [task({ title: 'Algo' })] }),
      TZ,
      NOW,
    );
    expect(notRelevant.warnings.map((warning) => warning.type)).not.toContain('content_gap');
    // Lo que sí avisa siempre: contenido que la persona fijó para ayer.
    const late = analyzeDay(
      raw({
        personalDna: dna,
        content: [content({ title: 'Reel tardío', status: 'ready', scheduledFor: dayAt(-1) })],
      }),
      TZ,
      NOW,
    );
    expect(late.warnings.map((warning) => warning.message)).toContain(
      '«Reel tardío» estaba prevista para ayer y aún no está publicada.',
    );
    expect(deterministicBrief(late).contentSuggestion?.title).toBe('Reel tardío');
  });
});

describe('Personalización: mismos hechos, dirección distinta', () => {
  const sameWork = () => {
    const p = project({
      name: 'Lanzamiento',
      dueDate: dayAt(1),
      stats: { tasks: 2, completedTasks: 0, contentItems: 0 },
    });
    return raw({
      projects: [{ project: p, lastActivityAt: ISO }],
      openTasks: [
        task({
          title: 'Editar el reel',
          projectId: p.id,
          priority: 'high',
          dueDate: dayAt(1),
          estimatedMinutes: 90,
        }),
        task({ title: 'Revisar propuesta', priority: 'high', dueDate: dayAt(0) }),
        task({ title: 'Ordenar archivos', dueDate: dayAt(4) }),
        task({ title: 'Escribir guion', projectId: p.id, dueDate: dayAt(1) }),
        task({ title: 'Responder correos', priority: 'low' }),
      ],
      content: [
        content({
          title: 'Cómo construí PersonalDNA',
          status: 'production',
          scheduledFor: dayAt(3),
        }),
      ],
    });
  };
  const personaA = () => {
    const dna = baseDna();
    dna.supportNeeds.wantsHelpWith = ['contenido', 'organización'];
    dna.workStyle.focusStyle = ['trabajo profundo'];
    return dna;
  };
  const personaB = () => {
    const dna = baseDna();
    dna.supportNeeds.wantsHelpWith = ['proyectos'];
    dna.goals.content = [];
    dna.workStyle.focusStyle = [];
    dna.workStyle.executionStyle = ['sesiones cortas'];
    return dna;
  };

  it('trabajo profundo + contenido vs sesiones cortas + proyectos', async () => {
    const engine = createDailyDirectorEngine({ ai: new DemoProvider(), logger });
    const a = await engine.generate(
      analyzeDay({ ...sameWork(), personalDna: personaA() }, TZ, NOW),
    );
    const b = await engine.generate(
      analyzeDay({ ...sameWork(), personalDna: personaB() }, TZ, NOW),
    );
    expect(focusModeOf(personaA())).toBe('deep');
    expect(focusModeOf(personaB())).toBe('short');
    // Mismos hechos: mismas prioridades y urgencias.
    expect(a.draft.priorities.map((p) => p.title)).toEqual(b.draft.priorities.map((p) => p.title));
    // Mañana + alta + proyecto en riesgo = 57 → alta (crítica empieza en 60).
    expect(a.draft.priorities[0]).toMatchObject({ title: 'Editar el reel', urgency: 'high' });
    // Dirección distinta.
    expect(a.draft.focusBlocks.length).toBeLessThanOrEqual(2);
    expect(b.draft.focusBlocks.length).toBeGreaterThan(a.draft.focusBlocks.length);
    expect(a.draft.contentSuggestion?.title).toBe('Cómo construí PersonalDNA');
    expect(b.draft.contentSuggestion).toBeNull();
    expect(a.draft.summary).not.toBe(b.draft.summary);
    expect(a.draft.summary).toMatch(/bloques largos/);
    expect(b.draft.summary).toMatch(/bloques cortos/);
    // Minutos solo de estimatedMinutes.
    expect(
      b.draft.focusBlocks.find((block) => block.title === 'Editar el reel')?.suggestedMinutes,
    ).toBe(90);
    expect(
      b.draft.focusBlocks.find((block) => block.title === 'Revisar propuesta')?.suggestedMinutes,
    ).toBeNull();
  });

  it('máximo 3 prioridades, sin rellenar: 1 tarea = 1 prioridad; sin trabajo = sin prioridades', () => {
    const many = analyzeDay(
      raw({
        openTasks: Array.from({ length: 20 }, (_, i) =>
          task({ title: `T${i}`, dueDate: dayAt(i % 5) }),
        ),
      }),
      TZ,
      NOW,
    );
    expect(deterministicBrief(many).priorities).toHaveLength(3);
    expect(many.warnings.map((warning) => warning.type)).toContain('overload');
    expect(deterministicBrief(many).summary).toMatch(/^Tienes 20 tareas pendientes/);
    expect(
      deterministicBrief(analyzeDay(raw({ openTasks: [task({ title: 'Única' })] }), TZ, NOW))
        .priorities,
    ).toHaveLength(1);
    const empty = deterministicBrief(analyzeDay(raw(), TZ, NOW));
    expect(empty).toMatchObject({ priorities: [], focusBlocks: [], contentSuggestion: null });
    expect(empty.summary).toMatch(/Aún no tienes suficiente trabajo registrado/);
  });
});

describe('DailyDirectorEngine con IA: el backend controla los hechos', () => {
  const work = () => {
    const overdue = task({ title: 'Cerrar factura', priority: 'high', dueDate: dayAt(-1) });
    return raw({
      openTasks: [
        overdue,
        task({ title: 'Diseñar portada', dueDate: dayAt(2) }),
        task({ title: 'Leer briefing' }),
      ],
    });
  };

  it('usa las refs de la IA y mapea a ids reales con títulos y urgencias del backend', async () => {
    const analysis = analyzeDay(work(), TZ, NOW);
    const ai = scripted((refs) => ({
      summary:
        'Hoy tienes una tarea vencida y una entrega cercana: empezaría por cerrar lo atrasado.',
      priorities: [
        {
          ref: refs[0]!,
          rationale: 'Venció ayer y es de prioridad alta: conviene cerrarla primero.',
          suggestedAction: 'Ciérrala antes de abrir nada nuevo.',
        },
        {
          ref: refs[1]!,
          rationale: 'Vence en dos días y todavía no la has empezado.',
          suggestedAction: null,
        },
      ],
      contentSuggestion: null,
      focusBlocks: [{ title: 'Lo atrasado', objective: 'Cerrar la factura', ref: refs[0]! }],
      closingNote: null,
    }));
    const result = await createDailyDirectorEngine({ ai, logger }).generate(analysis);
    expect(result.mode).toBe('ai');
    expect(result.generation).toMatchObject({
      provider: 'scripted',
      model: 'scripted-1',
      inputTokens: 100,
      fallbackReason: null,
    });
    expect(result.draft.priorities.map((p) => [p.title, p.urgency, p.resourceId])).toEqual([
      ['Cerrar factura', 'critical', analysis.tasks[0]!.item.id],
      ['Diseñar portada', analysis.tasks[1]!.urgency, analysis.tasks[1]!.item.id],
    ]);
    // Los avisos no salen de la IA: los pone el servicio desde el análisis determinístico.
    expect('warnings' in result.draft).toBe(false);
  });

  it('una referencia inventada (TASK_999) invalida la salida: se usa el fallback, nada corrupto', async () => {
    const ai = scripted(() => ({
      summary: 'Hoy concentraría tu atención en lo urgente.',
      priorities: [
        {
          ref: 'TASK_999',
          rationale: 'Es una tarea que vence hoy, la más urgente.',
          suggestedAction: null,
        },
      ],
      contentSuggestion: null,
      focusBlocks: [],
      closingNote: null,
    }));
    const analysis = analyzeDay(work(), TZ, NOW);
    const result = await createDailyDirectorEngine({ ai, logger }).generate(analysis);
    expect(result.mode).toBe('deterministic');
    expect(result.generation.fallbackReason).toBe('invalid_output');
    expect(
      result.draft.priorities.every((p) => analysis.tasks.some((t) => t.item.id === p.resourceId)),
    ).toBe(true);
  });

  it('una reunión con Nike, horarios o tiempo libre inventados se sanean; lo vencido crítico no se omite', async () => {
    const ai = scripted((refs) => ({
      summary: 'Hoy tienes una reunión con Nike a las 10:00. Primero cierra lo atrasado.',
      priorities: [
        {
          ref: refs[2]!,
          rationale: 'Antes de tu reunión con Nike conviene leerlo con calma.',
          suggestedAction: 'Tienes la tarde libre para hacerlo.',
        },
      ],
      contentSuggestion: null,
      focusBlocks: [
        { title: 'Reunión con Nike', objective: 'Preparar la llamada de las 10:00', ref: null },
      ],
      closingNote: 'Te quedan 3 horas libres.',
    }));
    const analysis = analyzeDay(work(), TZ, NOW);
    const result = await createDailyDirectorEngine({ ai, logger }).generate(analysis);
    const text = JSON.stringify(result.draft);
    expect(text).not.toMatch(/Nike|10:00|tarde libre|horas libres/);
    expect(result.draft.summary).toBe('Primero cierra lo atrasado.');
    expect(result.draft.priorities.map((p) => p.title)).toContain('Cerrar factura');
    expect(result.generation.sanitizedFields).toBeGreaterThanOrEqual(4);
  });

  it('las palabras de eventos valen si están en una tarea real', () => {
    const vocabulary = buildVocabulary([{ title: 'Preparar reunión con TINTO' }]);
    expect(dailyClaims('Prepara la reunión con TINTO', vocabulary)).toEqual([]);
    expect(dailyClaims('Prepara la llamada con Nike', vocabulary).length).toBeGreaterThan(0);
  });

  it('sin proveedor disponible, el brief determinístico sigue generándose', async () => {
    const down = scripted(() => new AIProviderError('unavailable', 'sin red'));
    const result = await createDailyDirectorEngine({ ai: down, logger }).generate(
      analyzeDay(work(), TZ, NOW),
    );
    expect(result).toMatchObject({
      mode: 'deterministic',
      generation: { fallbackReason: 'ai_unavailable' },
    });
    expect(result.draft.priorities[0]!.title).toBe('Cerrar factura');
    // Modo demo y sin trabajo: no se llama a la IA.
    const counting = scripted(() => new Error('no debería llamarse'));
    const empty = await createDailyDirectorEngine({ ai: counting, logger }).generate(
      analyzeDay(raw(), TZ, NOW),
    );
    expect([empty.generation.fallbackReason, counting.calls]).toEqual(['no_work', 0]);
    const demo = await createDailyDirectorEngine({ ai: new DemoProvider(), logger }).generate(
      analyzeDay(work(), TZ, NOW),
    );
    expect(demo.generation.fallbackReason).toBe('demo');
  });
});
