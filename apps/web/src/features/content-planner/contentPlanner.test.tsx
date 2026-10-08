import type { ContentPlan, ContentPlanItem, ContentPlanResponse } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import type { ResourceState } from '../../lib/useResource';
import { contentFixture, noop, projectFixture, WORKSPACE_ID } from '../../test/operationsFixtures';
import { ContentList } from '../operations/ContentList';
import {
  acceptContentPlanItem,
  generateContentPlan,
  rejectContentPlanItem,
  updateContentPlanItem,
} from './contentPlansApi';
import { ContentPlannerView, GenerationError } from './ContentPlannerPage';
import { ContentPlanView } from './ContentPlanPage';
import { PixelThinkingView } from './PixelThinking';
import type { PlanItemActions } from './PlanItemCard';
import {
  defaultGenerateForm,
  generateFormToInput,
  generationErrorMessage,
  nextMonday,
  periodEnd,
  periodLabel,
  regenerateInput,
} from './plannerLogic';

const NOW = '2026-10-07T15:00:00.000Z';
const base = '/workspace/w1';
const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ok = <T,>(data: T): ResourceState<T> => ({ status: 'success', data });

function planFixture(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '64b7f0c2a1b2c3d4e5f60040',
    workspaceId: WORKSPACE_ID,
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

function itemFixture(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: '64b7f0c2a1b2c3d4e5f60050',
    workspaceId: WORKSPACE_ID,
    contentPlanId: '64b7f0c2a1b2c3d4e5f60040',
    projectId: projectFixture().id,
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

const actions: PlanItemActions = { onAccept: noop, onReject: noop, onRestore: noop, onSave: noop };

describe('lógica del planner', () => {
  it('periodos: próximo lunes y fin del periodo (ambos días incluidos)', () => {
    expect(nextMonday(new Date(2026, 9, 7))).toBe('2026-10-12');
    expect(nextMonday(new Date(2026, 9, 12))).toBe('2026-10-12');
    expect(periodEnd('2026-10-12', 14)).toBe('2026-10-25');
    expect(periodEnd('2026-10-25', 7)).toBe('2026-10-31');
    expect(periodLabel(planFixture())).toMatch(/12 oct.*25 oct/);
  });

  it('formulario → petición: solo fechas por defecto; lo demás si se elige', () => {
    const form = { ...defaultGenerateForm(new Date(2026, 9, 7)) };
    expect(generateFormToInput(form)).toEqual({
      ok: true,
      input: { startDate: '2026-10-12', endDate: '2026-10-25' },
    });
    expect(
      generateFormToInput({
        ...form,
        period: '7',
        frequency: '3',
        platforms: ['instagram'],
        goal: ' autoridad ',
      }),
    ).toEqual({
      ok: true,
      input: {
        startDate: '2026-10-12',
        endDate: '2026-10-18',
        frequency: 3,
        platforms: ['instagram'],
        goal: 'autoridad',
      },
    });
    expect(generateFormToInput({ ...form, startDate: '' }).ok).toBe(false);
  });

  it('regenerar repite periodo, objetivo, plataformas y la frecuencia pedida', () => {
    expect(regenerateInput(planFixture())).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      regenerateFrom: '64b7f0c2a1b2c3d4e5f60040',
      platforms: ['instagram'],
      goal: 'posicionamiento',
      frequency: 3,
    });
  });

  it('mensajes por cada error de generación', () => {
    const error = (reason: string) => new ApiRequestError(409, 'CONFLICT', 'x', { reason });
    expect(generationErrorMessage(error('personal_context_not_configured')).title).toMatch(/ADN/);
    expect(generationErrorMessage(error('content_plan_generation_unavailable')).title).toMatch(
      /no está disponible/,
    );
    expect(generationErrorMessage(new Error('x')).title).toBe('No se pudo crear el plan');
  });
});

describe('contentPlansApi', () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  let respond: () => { status: number; body: unknown } = () => ({ status: 200, body: {} });
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const { status, body } = respond();
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const plans = `/api/workspaces/${WORKSPACE_ID}/content-plans`;
  const response: ContentPlanResponse = { plan: planFixture(), items: [itemFixture()] };

  it('generar envía la petición con la zona horaria del navegador', async () => {
    respond = () => ({ status: 201, body: response });
    await generateContentPlan(WORKSPACE_ID, {
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      platforms: ['instagram'],
    });
    expect(calls[0]).toEqual({
      url: `${plans}/generate`,
      method: 'POST',
      body: {
        startDate: '2026-10-12',
        endDate: '2026-10-25',
        platforms: ['instagram'],
        tzOffset: new Date().getTimezoneOffset(),
      },
    });
  });

  it('aceptar, rechazar (con motivo) y editar una propuesta', async () => {
    respond = () => ({
      status: 201,
      body: {
        item: itemFixture({ status: 'converted', convertedContentItemId: contentFixture().id }),
        contentItem: contentFixture({ source: 'pixel', status: 'idea' }),
        created: true,
      },
    });
    const accepted = await acceptContentPlanItem(WORKSPACE_ID, 'p1', 'i1');
    expect(accepted.contentItem?.source).toBe('pixel');
    respond = () => ({ status: 200, body: { item: itemFixture({ status: 'rejected' }) } });
    await rejectContentPlanItem(WORKSPACE_ID, 'p1', 'i1', 'No encaja');
    await updateContentPlanItem(WORKSPACE_ID, 'p1', 'i1', { title: 'Nuevo' });
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['POST', `${plans}/p1/items/i1/accept`, undefined],
      ['POST', `${plans}/p1/items/i1/reject`, { reason: 'No encaja' }],
      ['PATCH', `${plans}/p1/items/i1`, { title: 'Nuevo' }],
    ]);
  });
});

describe('vistas del Content Planner', () => {
  const planner = (state: Parameters<typeof ContentPlannerView>[0]['state'], creating = false) =>
    text(
      render(
        <ContentPlannerView
          base={base}
          state={state}
          onRetry={() => {}}
          creating={creating}
          onCreate={() => {}}
          generator={<PixelThinkingView avatar={null} />}
        />,
      ),
    );

  it('estado vacío con su llamada a crear el primero', () => {
    const html = planner(ok({ plans: [], total: 0 }));
    expect(html).toContain('Aún no tienes un plan de contenido.');
    expect(html).toContain('Crear plan con Pixel');
  });

  it('lista de planes con estado, periodo y conteos', () => {
    const html = planner(
      ok({
        plans: [
          planFixture(),
          planFixture({
            id: '64b7f0c2a1b2c3d4e5f60041',
            name: 'Octubre · Semana 3',
            status: 'active',
          }),
        ],
        total: 2,
      }),
    );
    expect(html).toContain('Octubre · 12–25');
    expect(html).toContain('Borrador');
    expect(html).toContain('Octubre · Semana 3');
    expect(html).toContain('Activo');
    expect(html).toContain('1 en Contenido');
  });

  it('generando: Pixel piensa, sin barras de progreso falsas', () => {
    const html = render(<PixelThinkingView avatar={null} />);
    expect(text(html)).toContain('Pixel está construyendo tu estrategia…');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('progressbar');
  });

  it('errores visibles: carga y generación', () => {
    expect(
      planner({ status: 'error', error: new ApiRequestError(500, 'INTERNAL_ERROR', 'Caído') }),
    ).toContain('Reintentar');
    expect(planner({ status: 'loading' })).toContain('Cargando tus planes…');
    const html = text(
      render(
        <GenerationError
          base={base}
          error={
            new ApiRequestError(409, 'CONFLICT', 'Completa tu onboarding', {
              reason: 'personal_context_not_configured',
            })
          }
        />,
      ),
    );
    expect(html).toContain('Pixel aún no conoce tu ADN personal');
    expect(html).toContain('Completar mi onboarding');
  });

  const detail = (data: ContentPlanResponse) =>
    render(
      <ContentPlanView
        base={base}
        state={ok(data)}
        projects={[projectFixture()]}
        onRetry={() => {}}
        actions={actions}
        regenerating={false}
        regenerateSlot={null}
        onRegenerate={() => {}}
        onStatus={noop}
      />,
    );

  it('muestra primero la estrategia, después los pilares y las propuestas justificadas', () => {
    const html = text(detail({ plan: planFixture(), items: [itemFixture()] }));
    const order = ['Estrategia', 'Pilares', 'Propuestas'].map((label) => html.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('priorizar autoridad y proceso creativo');
    expect(html).toContain('Trabajo real');
    expect(html).toContain('Cómo convierto un brief confuso');
    expect(html).toContain('Instagram · Reel');
    expect(html).toContain('Autoridad');
    expect(html).toContain('Marca personal'); // proyecto real
    expect(html).toContain('«Todo brief confuso esconde una decisión.»');
    expect(html).toContain('Por qué Pixel lo recomienda');
    expect(html).toContain('Demuestra criterio creativo');
    expect(html).toContain('Pixel descartó 1 propuesta');
    expect(html).toMatch(/Aceptar.*Editar.*Rechazar/);
  });

  it('estados visuales: Convertido (Añadido a Contenido) y Rechazado (Recuperar)', () => {
    const html = text(
      detail({
        plan: planFixture(),
        items: [
          itemFixture({ status: 'converted', convertedContentItemId: contentFixture().id }),
          itemFixture({
            id: '64b7f0c2a1b2c3d4e5f60051',
            title: 'Otra',
            status: 'rejected',
            rejectionReason: 'No encaja',
          }),
        ],
      }),
    );
    expect(html).toContain('Convertido');
    expect(html).toContain('Añadido a Contenido');
    expect(html).toContain('Ver en Contenido');
    expect(html).toContain('Rechazado');
    expect(html).toContain('Motivo: No encaja');
    expect(html).toContain('Recuperar');
  });

  it('modo demo y plan de otro workspace (404) sin datos', () => {
    expect(
      text(
        detail({
          plan: planFixture({ generation: { ...planFixture().generation!, mode: 'demo' } }),
          items: [],
        }),
      ),
    ).toContain('Modo demo');
    const notFound = text(
      render(
        <ContentPlanView
          base={base}
          state={{
            status: 'error',
            error: new ApiRequestError(404, 'NOT_FOUND', 'Plan de contenido no encontrado'),
          }}
          projects={[]}
          onRetry={() => {}}
          actions={actions}
          regenerating={false}
          regenerateSlot={null}
          onRegenerate={() => {}}
          onStatus={noop}
        />,
      ),
    );
    expect(notFound).toContain('Plan no encontrado');
    expect(notFound).not.toContain('Estrategia');
  });

  it('tras aceptar, la pieza aparece en Contenido marcada como propuesta de Pixel', () => {
    const html = text(
      render(
        <ContentList
          items={[
            contentFixture({
              title: 'Cómo convierto un brief confuso',
              status: 'idea',
              source: 'pixel',
            }),
          ]}
          projects={[]}
          actions={{ onMove: noop, onSave: noop, onDelete: noop }}
        />,
      ),
    );
    expect(html).toContain('Cómo convierto un brief confuso');
    expect(html).toContain('Propuesto por Pixel');
    expect(html).toContain('Pasar a Planificado');
  });
});
