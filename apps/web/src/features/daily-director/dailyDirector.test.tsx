import type { DailyBrief } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import { WORKSPACE_ID } from '../../test/operationsFixtures';
import { generateDailyBrief, getDailyBrief, listDailyBriefs } from './dailyBriefApi';
import {
  generationLabel,
  isNotGenerated,
  minutesLabel,
  resourceHref,
  suggestionLink,
  updatedAgo,
} from './dailyLogic';
import { DailyDirectorView, type DailyState } from './DailyDirectorView';

const base = '/workspace/w1';
const NOW = new Date('2026-10-08T20:00:00.000Z');
const TASK = '64b7f0c2a1b2c3d4e5f60020';
const PROJECT = '64b7f0c2a1b2c3d4e5f60010';
const CONTENT = '64b7f0c2a1b2c3d4e5f60030';

function briefFixture(overrides: Partial<DailyBrief> = {}): DailyBrief {
  return {
    id: '64b7f0c2a1b2c3d4e5f60090',
    workspaceId: WORKSPACE_ID,
    contextType: 'personal',
    localDate: '2026-10-08',
    timezone: 'America/Bogota',
    version: 1,
    personalDnaVersion: 2,
    generationMode: 'ai',
    summary: 'Hoy tienes dos entregas cercanas y una pieza de contenido que ya puede avanzar.',
    priorities: [
      {
        rank: 1,
        type: 'task',
        resourceId: TASK,
        title: 'Terminar edición del reel',
        rationale: 'Vence mañana y su proyecto está en riesgo.',
        suggestedAction: 'Cierra el corte final.',
        urgency: 'critical',
      },
      {
        rank: 2,
        type: 'project',
        resourceId: PROJECT,
        title: 'Propuesta TINTO',
        rationale: 'Vence en dos días y tiene tres tareas abiertas.',
        suggestedAction: null,
        urgency: 'high',
      },
    ],
    warnings: [
      {
        type: 'overdue',
        message: 'Tienes 2 tareas vencidas. No empezaría nada nuevo antes de cerrar al menos una.',
        relatedResourceIds: [TASK],
      },
    ],
    contentSuggestion: {
      contentItemId: CONTENT,
      contentPlanItemId: null,
      contentPlanId: null,
      projectId: null,
      title: 'Cómo construí PersonalDNA',
      reason: 'Ya está en producción y encaja con tu objetivo de autoridad.',
      suggestedAction: 'record',
    },
    focusBlocks: [
      {
        order: 1,
        title: 'Edición',
        objective: 'Cerrar el corte final',
        relatedResourceId: TASK,
        relatedResourceType: 'task',
        suggestedMinutes: 90,
      },
      {
        order: 2,
        title: 'Propuesta TINTO',
        objective: 'Revisar las tareas abiertas',
        relatedResourceId: PROJECT,
        relatedResourceType: 'project',
        suggestedMinutes: null,
      },
    ],
    closingNote: 'Lo demás puede esperar.',
    facts: {
      openTasks: 8,
      overdueTasks: 2,
      dueToday: 1,
      dueTomorrow: 2,
      activeProjects: 2,
      activeContent: 3,
    },
    generation: {
      provider: 'anthropic',
      model: 'claude',
      latencyMs: 900,
      inputTokens: 1000,
      outputTokens: 300,
      fallbackReason: null,
      sanitizedFields: 0,
    },
    contextSnapshotAt: '2026-10-08T19:50:00.000Z',
    generatedAt: '2026-10-08T19:50:00.000Z',
    createdAt: '2026-10-08T19:50:00.000Z',
    updatedAt: '2026-10-08T19:50:00.000Z',
    ...overrides,
  };
}

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const view = (state: DailyState, extra: Partial<Parameters<typeof DailyDirectorView>[0]> = {}) =>
  render(
    <DailyDirectorView
      base={base}
      firstName="Jhon"
      state={state}
      avatar={null}
      onRegenerate={() => {}}
      onRetry={() => {}}
      now={NOW}
      {...extra}
    />,
  );
const ready = (brief = briefFixture(), stale = false): DailyState => ({
  status: 'ready',
  data: { brief, stale },
});

describe('dailyLogic', () => {
  it('enlaces por tipo de recurso', () => {
    expect(resourceHref(base, 'task', TASK)).toBe(`${base}/tasks`);
    expect(resourceHref(base, 'project', PROJECT)).toBe(`${base}/projects/${PROJECT}`);
    expect(resourceHref(base, 'content', CONTENT)).toBe(`${base}/content`);
    expect(resourceHref(base, 'plan_item', 'x')).toBe(`${base}/content-planner`);
    expect(resourceHref(base, null, null)).toBeNull();
    expect(
      suggestionLink(base, {
        contentItemId: null,
        contentPlanItemId: 'i',
        contentPlanId: 'p1',
        projectId: null,
        title: 't',
        reason: 'r',
        suggestedAction: 'plan',
      }),
    ).toEqual({ href: `${base}/content-planner/p1`, label: 'Ver en el plan' });
  });

  it('actualizado hace…, modo de generación y minutos solo estimados', () => {
    expect(updatedAgo('2026-10-08T19:50:00.000Z', NOW)).toBe('hace 10 min');
    expect(updatedAgo('2026-10-08T17:00:00.000Z', NOW)).toBe('hace 3 h');
    expect(updatedAgo(NOW.toISOString(), NOW)).toBe('hace un momento');
    expect(generationLabel(briefFixture())).toBe('Dirección de Pixel');
    expect(
      generationLabel(
        briefFixture({
          generationMode: 'deterministic',
          generation: { ...briefFixture().generation, fallbackReason: 'demo' },
        }),
      ),
    ).toMatch(/sin IA/);
    expect(
      generationLabel(
        briefFixture({
          generationMode: 'deterministic',
          generation: { ...briefFixture().generation, fallbackReason: 'ai_unavailable' },
        }),
      ),
    ).toMatch(/IA no estaba disponible/);
    expect(minutesLabel({ suggestedMinutes: 90 })).toBe('≈ 90 min, según tu estimación');
    expect(minutesLabel({ suggestedMinutes: null })).toBeNull();
  });

  it('detecta "aún no hay dirección" por la razón del error', () => {
    expect(
      isNotGenerated(
        new ApiRequestError(404, 'NOT_FOUND', 'x', { reason: 'daily_brief_not_generated' }),
      ),
    ).toBe(true);
    expect(isNotGenerated(new ApiRequestError(404, 'NOT_FOUND', 'x'))).toBe(false);
  });
});

describe('dailyBriefApi', () => {
  const calls: { url: string; method: string }[] = [];
  let status = 200;
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET' });
      const body = url.includes('daily-briefs')
        ? { briefs: [briefFixture()], total: 1 }
        : { brief: briefFixture(), stale: false };
      return new Response(
        JSON.stringify(
          status === 404
            ? {
                error: {
                  code: 'NOT_FOUND',
                  message: 'Aún no hay dirección para hoy',
                  details: { reason: 'daily_brief_not_generated' },
                },
              }
            : body,
        ),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    status = 200;
  });

  it('GET vigente, POST generar e historial, todos en el workspace activo', async () => {
    const api = `/api/workspaces/${WORKSPACE_ID}`;
    expect((await getDailyBrief(WORKSPACE_ID)).brief.version).toBe(1);
    await generateDailyBrief(WORKSPACE_ID);
    await listDailyBriefs(WORKSPACE_ID, { limit: 5 });
    expect(calls).toEqual([
      { url: `${api}/daily-brief`, method: 'GET' },
      { url: `${api}/daily-brief/generate`, method: 'POST' },
      { url: `${api}/daily-briefs?limit=5`, method: 'GET' },
    ]);
  });

  it('sin brief, el error lleva la razón (la UI genera una vez)', async () => {
    status = 404;
    const error = await getDailyBrief(WORKSPACE_ID).catch((err: unknown) => err);
    expect(isNotGenerated(error)).toBe(true);
  });
});

describe('TU DÍA (vista)', () => {
  it('prioridades numeradas con urgencia, porqué y enlace; no más de las que hay', () => {
    const html = view(ready());
    const plain = text(html);
    expect(plain).toContain('Tu día · Hola, Jhon');
    expect(plain).toContain('Hoy tienes dos entregas cercanas');
    expect(plain).toMatch(
      /01 Crítica Terminar edición del reel Vence mañana y su proyecto está en riesgo\. Cierra el corte final\./,
    );
    expect(plain).toContain('02 Alta Propuesta TINTO');
    expect(plain).not.toContain('03');
    expect(html).toContain(`href="${base}/tasks"`);
    expect(html).toContain(`href="${base}/projects/${PROJECT}"`);
    expect(plain).toContain('8 tareas abiertas, hoy solo estas');
    expect(plain).toContain('Actualizado hace 10 min');
    expect(plain).toContain('Actualizar dirección');
  });

  it('avisos, contenido y bloques de enfoque (sin horarios)', () => {
    const plain = text(view(ready()));
    expect(plain).toContain('Requiere atención');
    expect(plain).toContain('Tienes 2 tareas vencidas');
    expect(plain).toContain('Contenido · Grabar');
    expect(plain).toContain('Cómo construí PersonalDNA');
    expect(plain).toContain('Abrir contenido');
    expect(plain).toContain('Enfoque recomendado');
    expect(plain).toMatch(/Bloque 1 Edición Cerrar el corte final ≈ 90 min, según tu estimación/);
    expect(plain).toMatch(/Bloque 2 Propuesta TINTO Revisar las tareas abiertas/);
    expect(plain).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('sin avisos ni contenido no hay cajas vacías', () => {
    const plain = text(
      view(ready(briefFixture({ warnings: [], contentSuggestion: null, focusBlocks: [] }))),
    );
    expect(plain).not.toContain('Requiere atención');
    expect(plain).not.toContain('Contenido ·');
    expect(plain).not.toContain('Enfoque recomendado');
  });

  it('stale: lo dice y ofrece actualizar', () => {
    expect(text(view(ready(briefFixture(), true)))).toContain(
      'Hay cambios en tu trabajo desde esta recomendación.',
    );
    expect(text(view(ready(briefFixture(), false)))).not.toContain('Hay cambios');
  });

  it('generando: Pixel piensa (también al regenerar, manteniendo lo anterior debajo)', () => {
    const thinking = text(view({ status: 'generating', previous: null }));
    expect(thinking).toContain('Pixel está revisando tu trabajo…');
    expect(thinking).not.toContain('Actualizar dirección');
    const regenerating = text(
      view({ status: 'generating', previous: { brief: briefFixture(), stale: true } }),
    );
    expect(regenerating).toContain('Pixel está revisando tu trabajo…');
    expect(regenerating).toContain('Terminar edición del reel');
    expect(regenerating).not.toContain('Hay cambios');
  });

  it('error visible con reintento; carga sin pantalla en silencio', () => {
    const plain = text(
      view({
        status: 'error',
        error: new ApiRequestError(
          500,
          'INTERNAL_ERROR',
          'No se pudo generar la dirección del día',
        ),
      }),
    );
    expect(plain).toContain('No pudimos preparar tu dirección de hoy');
    expect(plain).toContain('Reintentar');
    expect(text(view({ status: 'loading' }))).toContain('Cargando tu dirección para hoy…');
  });

  it('fallback determinístico y sin trabajo: honesto, con CTA a crear una tarea', () => {
    const fallback = text(
      view(
        ready(
          briefFixture({
            generationMode: 'deterministic',
            generation: { ...briefFixture().generation, fallbackReason: 'demo' },
          }),
        ),
      ),
    );
    expect(fallback).toContain('Dirección básica, calculada con tus fechas y prioridades (sin IA)');
    const empty = view(
      ready(
        briefFixture({
          summary:
            'Aún no tienes suficiente trabajo registrado para construir una dirección útil para hoy.',
          priorities: [],
          warnings: [],
          contentSuggestion: null,
          focusBlocks: [],
          closingNote: null,
          generationMode: 'deterministic',
          generation: { ...briefFixture().generation, fallbackReason: 'no_work' },
        }),
      ),
    );
    expect(text(empty)).toContain('Aún no tienes suficiente trabajo registrado');
    expect(text(empty)).toContain('Crear una tarea');
    expect(empty).toContain(`href="${base}/tasks"`);
  });

  it('responsive: prioridades en una columna en móvil y tres en escritorio; el avatar se oculta en móvil', () => {
    const html = view(ready());
    expect(html).toContain('grid gap-4 lg:grid-cols-3');
    expect(html).toContain('max-lg:hidden');
  });
});
