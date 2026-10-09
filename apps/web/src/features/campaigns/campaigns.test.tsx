import type { WorkspaceOverview } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterpriseNav, enterpriseStaysInWorkspace, workspaceNav } from '../../app/navigation';
import { ApiRequestError } from '../../lib/api';
import type { ResourceState } from '../../lib/useResource';
import {
  CAMPAIGN_ID,
  campaignFixture,
  deliverableFixture,
  strategyFixture,
} from '../../test/campaignFixtures';
import { contentFixture, noop, projectFixture, WORKSPACE_ID } from '../../test/operationsFixtures';
import { PixelThinkingView } from '../content-planner/PixelThinking';
import type { ContentListActions } from '../operations/ContentList';
import { FeatureOnly } from '../workspaces/FeatureOnly';
import type { WorkspaceOutletContext } from '../workspaces/workspaceContext';
import { CampaignDetailView } from './CampaignDetailPage';
import { CampaignForm } from './CampaignForm';
import {
  CAMPAIGN_THINKING_COPY,
  campaignGenerationError,
  conversionFeedback,
  emptyCampaignForm,
  manualCampaignInput,
  pixelCampaignInput,
  type CampaignTab,
} from './campaignLogic';
import { CampaignError, CampaignsView } from './CampaignsPage';
import { acceptDeliverable, generateCampaign } from './campaignsApi';
import { DeliverableCard, type DeliverableActions } from './DeliverableCard';
import { StrategyView } from './StrategyView';

const base = `/workspace/${WORKSPACE_ID}`;
const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ok = <T,>(data: T): ResourceState<T> => ({ status: 'success', data });
const failed: ResourceState<never> = {
  status: 'error',
  error: new ApiRequestError(500, 'INTERNAL_ERROR', 'El servidor no respondió'),
};
const deliverableActions: DeliverableActions = { onAccept: noop, onReject: noop, onSave: noop };
const contentActions: ContentListActions = { onMove: noop, onSave: noop, onDelete: noop };

describe('Navegación y gating', () => {
  it('Enterprise: Campañas es lo primero de Trabajo y vive en /workspace', () => {
    const work = enterpriseNav('c1', 'w1').find((group) => group.label === 'Trabajo')!;
    expect(work.items[0]).toMatchObject({ label: 'Campañas', to: '/workspace/w1/campaigns' });
    expect(enterpriseStaysInWorkspace('/workspace/w1/campaigns')).toBe(true);
    expect(enterpriseStaysInWorkspace('/workspace/w1/campaigns/abc')).toBe(true);
  });

  it('Personal no ve Campañas en la navegación', () => {
    const labels = workspaceNav('w1', 'personal').flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain('Campañas');
  });

  it('FeatureOnly: Personal no entra a /campaigns; Enterprise sí', () => {
    const overview = (type: 'personal' | 'enterprise') =>
      ({
        workspace: {
          id: WORKSPACE_ID,
          ownerId: WORKSPACE_ID,
          type,
          name: 'X',
          slug: 'x',
          status: 'active',
          timezone: null,
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        },
        company: null,
        personal: null,
      }) satisfies WorkspaceOverview;
    const at = (type: 'personal' | 'enterprise') => {
      const context: WorkspaceOutletContext = { overview: overview(type), reload: () => {} };
      return renderToStaticMarkup(
        <MemoryRouter initialEntries={[`${base}/campaigns`]}>
          <Routes>
            <Route path="/workspace/:workspaceId" element={<Outlet context={context} />}>
              <Route
                path="campaigns"
                element={
                  <FeatureOnly feature="campaigns">
                    <p>CAMPAÑAS</p>
                  </FeatureOnly>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    };
    expect(at('enterprise')).toContain('CAMPAÑAS');
    expect(at('personal')).not.toContain('CAMPAÑAS');
  });
});

describe('Lista de campañas', () => {
  const view = (
    state: Parameters<typeof CampaignsView>[0]['state'],
    creating = false,
    panel: ReactNode = null,
  ) =>
    render(
      <CampaignsView
        base={base}
        state={state}
        filter="all"
        onFilterChange={() => {}}
        onRetry={() => {}}
        onNew={() => {}}
        onGenerate={() => {}}
        creating={creating}
        panel={panel}
      />,
    );

  it('estado vacío con "Crear con Pixel" y "Nueva campaña"', () => {
    const plain = text(view(ok({ campaigns: [], total: 0 })));
    expect(plain).toContain('Todavía no hay campañas.');
    expect(plain).toContain('Crear con Pixel');
    expect(plain).toContain('Nueva campaña');
  });

  it('tarjetas con estado, mensaje y su conexión con la ejecución; filtros', () => {
    const html = view(ok({ campaigns: [campaignFixture()], total: 1 }));
    const plain = text(html);
    for (const filter of [
      'Todas',
      'Borrador',
      'Planificadas',
      'Activas',
      'Completadas',
      'Archivadas',
    ]) {
      expect(plain).toContain(filter);
    }
    expect(plain).toContain('Lanzamiento TINTO 500 g');
    expect(plain).toContain('Borrador');
    expect(plain).toContain('«Café TINTO 500 g: el mismo origen.»');
    expect(plain).toContain('1 de 3 piezas en ejecución');
    expect(html).toContain(`href="${base}/campaigns/${CAMPAIGN_ID}"`);
  });

  it('el error de la API es visible y se puede reintentar', () => {
    const plain = text(view(failed));
    expect(plain).toContain('El servidor no respondió');
    expect(plain).toContain('Reintentar');
  });
});

describe('Crear: manual o con Pixel', () => {
  const form = (mode: 'manual' | 'pixel') =>
    text(
      render(
        <CampaignForm
          mode={mode}
          form={emptyCampaignForm}
          onChange={() => {}}
          errors={{}}
          busy={false}
          onSubmit={() => {}}
          onCancel={() => {}}
        />,
      ),
    );

  it('manual: nombre y objetivo, sin IA', () => {
    const plain = form('manual');
    expect(plain).toContain('Nueva campaña');
    expect(plain).toContain('Crear campaña');
    expect(plain).not.toContain('Elementos obligatorios');
    const invalid = manualCampaignInput({ ...emptyCampaignForm, objective: 'Vender' });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.name).toBeTruthy();
  });

  it('con Pixel: el brief completo; basta el objetivo (el nombre es opcional)', () => {
    const plain = form('pixel');
    for (const field of [
      'Nombre (opcional)',
      'Objetivo',
      'Tipo de campaña',
      'Producto o servicio',
      'Público (opcional)',
      'Problema (opcional)',
      'Resultado deseado (opcional)',
      'Canales',
      'Inicio',
      'Fin',
      'Restricciones',
      'Elementos obligatorios',
    ]) {
      expect(plain).toContain(field);
    }
    expect(plain).toContain('Construir estrategia');
    const result = pixelCampaignInput({ ...emptyCampaignForm, objective: 'Lanzar un producto' });
    expect(result.ok && result.input).toMatchObject({ objective: 'Lanzar un producto' });
    expect(result.ok && 'name' in result.input).toBe(false);
    expect(pixelCampaignInput(emptyCampaignForm).ok).toBe(false);
  });

  it('mientras genera: el personaje "pensando" y una frase honesta (sin progreso falso)', () => {
    const html = render(<PixelThinkingView avatar={null} copy={CAMPAIGN_THINKING_COPY} />);
    expect(text(html)).toContain('Pixel está construyendo la estrategia de campaña…');
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/progressbar|%/);
  });

  it('errores de generación con su explicación', () => {
    const unavailable = new ApiRequestError(503, 'SERVICE_UNAVAILABLE', 'No disponible', {
      reason: 'campaign_generation_unavailable',
    });
    expect(campaignGenerationError(unavailable).title).toBe(
      'La generación de campañas no está disponible ahora mismo',
    );
    const noDna = new ApiRequestError(409, 'CONFLICT', 'Sin ADN', { reason: 'brand_dna_missing' });
    const plain = text(render(<CampaignError error={noDna} base={base} mode="pixel" />));
    expect(plain).toContain('Pixel aún no conoce el ADN de esta marca');
    expect(plain).toContain('Completar el onboarding de la marca');
  });
});

describe('Estrategia', () => {
  it('se lee como un documento de dirección creativa', () => {
    const plain = text(render(<StrategyView strategy={strategyFixture()} versions={[1]} />));
    for (const block of [
      'Concepto creativo',
      'Del origen a la mesa',
      'Mensaje principal',
      'Problema estratégico',
      'Oportunidad',
      'Insight',
      'Narrativa',
      'Mensajes secundarios',
      'Tono',
      'Dirección visual',
      'Canales',
      'Pilares',
      'Evitar',
      'Por qué representa a la marca',
    ]) {
      expect(plain).toContain(block);
    }
    expect(plain).toContain('Derivado del ADN de la marca');
    expect(plain).toContain('Modo demo');
    expect(plain).not.toMatch(/insightType|visualDirection|\{/);
  });

  it('una hipótesis se presenta como "Hipótesis estratégica", nunca como insight validado', () => {
    const plain = text(
      render(
        <StrategyView
          strategy={strategyFixture({ insightType: 'strategic_hypothesis' })}
          versions={[1, 2]}
          onVersionChange={() => {}}
        />,
      ),
    );
    expect(plain).toContain('Hipótesis estratégica');
    expect(plain).toContain('conviene validarla');
    expect(plain).not.toMatch(/validado/i);
    expect(plain).toContain('Versión 2 (vigente)');
  });
});

describe('Piezas', () => {
  const card = (overrides: Parameters<typeof deliverableFixture>[0] = {}) =>
    render(
      <DeliverableCard
        deliverable={deliverableFixture(overrides)}
        base={base}
        actions={deliverableActions}
      />,
    );

  it('propuesta: tipo, canal, formato, objetivo, porqué y acciones', () => {
    const plain = text(card());
    expect(plain).toContain('Reel de lanzamiento');
    expect(plain).toContain('Contenido · Instagram · Reel');
    expect(plain).toContain('Objetivo: Presentar el producto');
    expect(plain).toContain('¿Por qué? Muestra el origen en movimiento.');
    for (const action of ['Aceptar', 'Editar', 'Rechazar']) expect(plain).toContain(action);
    expect(plain).toContain('Se creará en Contenido');
    expect(text(card({ type: 'design', title: 'Pieza gráfica' }))).toContain(
      'Se creará un proyecto',
    );
  });

  it('convertida: sin acciones y con enlace a lo creado', () => {
    const html = card({
      status: 'converted',
      type: 'design',
      convertedProjectId: '64b7f0c2a1b2c3d4e5f60301',
    });
    expect(text(html)).toContain('En ejecución');
    expect(text(html)).toContain('Ver el proyecto');
    expect(html).toContain(`href="${base}/projects/64b7f0c2a1b2c3d4e5f60301"`);
    expect(text(html)).not.toContain('Aceptar');
  });

  it('rechazada: se conserva (atenuada) y se puede aceptar después', () => {
    const plain = text(card({ status: 'rejected' }));
    expect(plain).toContain('Rechazada');
    expect(plain).toContain('Aceptar');
    expect(plain).not.toContain('Rechazar');
  });

  it('aviso tras aceptar: "Creado en Contenido" o "Proyecto creado", con enlace', () => {
    const deliverable = deliverableFixture({ status: 'converted' });
    expect(
      conversionFeedback(
        { deliverable, created: true, contentItem: contentFixture(), project: null },
        base,
      ),
    ).toEqual({ message: 'Creado en Contenido', href: `${base}/content` });
    const project = projectFixture({ campaignId: CAMPAIGN_ID });
    expect(
      conversionFeedback({ deliverable, created: true, contentItem: null, project }, base),
    ).toEqual({
      message: 'Proyecto creado',
      href: `${base}/projects/${project.id}`,
    });
  });
});

describe('Detalle de campaña', () => {
  const detail = (
    tab: CampaignTab,
    overrides: Partial<Parameters<typeof CampaignDetailView>[0]> = {},
  ) =>
    render(
      <CampaignDetailView
        base={base}
        campaign={ok(campaignFixture())}
        strategy={ok({ strategy: strategyFixture(), versions: [1] })}
        deliverables={ok([deliverableFixture()])}
        projects={ok({
          projects: [projectFixture({ name: 'Pieza gráfica principal', campaignId: CAMPAIGN_ID })],
          total: 1,
        })}
        content={ok({
          contentItems: [contentFixture({ title: 'Reel de lanzamiento', campaignId: CAMPAIGN_ID })],
          total: 1,
        })}
        tab={tab}
        onTabChange={() => {}}
        onRetry={() => {}}
        deliverableActions={deliverableActions}
        contentActions={contentActions}
        onVersionChange={() => {}}
        onStatusChange={noop}
        regenerating={false}
        regenerateError={null}
        thinking={<p>PENSANDO</p>}
        onRegenerate={() => {}}
        {...overrides}
      />,
    );

  it('cabecera: nombre, estado, objetivo, periodo, producto y público; secciones', () => {
    const plain = text(detail('strategy'));
    expect(plain).toContain('Lanzamiento TINTO 500 g');
    expect(plain).toContain('Presentar la nueva presentación de 500 g');
    expect(plain).toContain('Café TINTO 500 g');
    expect(plain).toContain('Amantes del café de origen');
    expect(plain).toMatch(/noviembre de 2026/);
    for (const tab of ['Estrategia', 'Piezas', 'Proyectos', 'Contenido'])
      expect(plain).toContain(tab);
    expect(plain).toContain('Regenerar estrategia');
    expect(plain).not.toMatch(/Equipo|Aprobaci/);
  });

  it('regenerando: el personaje pensando en lugar de la estrategia', () => {
    const plain = text(detail('strategy', { regenerating: true }));
    expect(plain).toContain('PENSANDO');
    expect(plain).not.toContain('Concepto creativo');
  });

  it('campaña manual sin estrategia: invita a crearla con Pixel', () => {
    const plain = text(
      detail('strategy', {
        campaign: ok(campaignFixture({ currentStrategyVersion: null, generatedBy: 'manual' })),
        strategy: ok({ strategy: null, versions: [] }),
      }),
    );
    expect(plain).toContain('Esta campaña aún no tiene estrategia.');
    expect(plain).toContain('Crear estrategia con Pixel');
  });

  it('Piezas, Proyectos y Contenido vinculados por campaignId', () => {
    expect(text(detail('deliverables'))).toContain('Reel de lanzamiento');
    const projects = detail('projects');
    expect(text(projects)).toContain('Pieza gráfica principal');
    expect(projects).toContain(`href="${base}/projects/`);
    expect(text(detail('content'))).toContain('Reel de lanzamiento');
  });

  it('404 de otra campaña o workspace y errores de carga con reintento', () => {
    const notFound = text(
      detail('strategy', {
        campaign: {
          status: 'error',
          error: new ApiRequestError(404, 'NOT_FOUND', 'Campaña no encontrada'),
        },
      }),
    );
    expect(notFound).toContain('Campaña no encontrada');
    expect(text(detail('projects', { projects: failed }))).toContain('Reintentar');
  });
});

describe('campaignsApi', () => {
  let calls: { url: string; method: string; body: unknown }[] = [];
  let respond: () => { status: number; body: unknown } = () => ({ status: 200, body: {} });
  beforeEach(() => {
    calls = [];
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

  it('generar hace POST a /campaigns/generate del workspace activo y valida la respuesta', async () => {
    respond = () => ({
      status: 201,
      body: {
        campaign: campaignFixture(),
        strategy: strategyFixture(),
        deliverables: [deliverableFixture()],
      },
    });
    const result = await generateCampaign(WORKSPACE_ID, { objective: 'Lanzar' });
    expect(calls[0]).toMatchObject({
      url: `/api/workspaces/${WORKSPACE_ID}/campaigns/generate`,
      method: 'POST',
      body: { objective: 'Lanzar' },
    });
    expect(result.strategy.concept).toBe('Del origen a la mesa');
  });

  it('aceptar una pieza hace POST a su /accept', async () => {
    respond = () => ({
      status: 201,
      body: {
        deliverable: deliverableFixture({
          status: 'converted',
          convertedContentItemId: contentFixture().id,
        }),
        created: true,
        contentItem: contentFixture({ campaignId: CAMPAIGN_ID }),
        project: null,
      },
    });
    const result = await acceptDeliverable(WORKSPACE_ID, CAMPAIGN_ID, deliverableFixture().id);
    expect(calls[0]!.url).toBe(
      `/api/workspaces/${WORKSPACE_ID}/campaigns/${CAMPAIGN_ID}/deliverables/${deliverableFixture().id}/accept`,
    );
    expect(result.contentItem?.campaignId).toBe(CAMPAIGN_ID);
  });

  it('un error de la API llega con su motivo', async () => {
    respond = () => ({
      status: 503,
      body: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'No disponible',
          details: { reason: 'campaign_generation_unavailable' },
        },
      },
    });
    await expect(generateCampaign(WORKSPACE_ID, { objective: 'X' })).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
