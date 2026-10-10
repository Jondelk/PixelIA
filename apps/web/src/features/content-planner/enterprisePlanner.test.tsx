import type { WorkspaceOverview } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import type { ResourceState } from '../../lib/useResource';
import {
  CAMPAIGN_ID,
  campaignFixture,
  deliverableFixture,
  strategyFixture,
} from '../../test/campaignFixtures';
import { contentFixture, noop, projectFixture, WORKSPACE_ID } from '../../test/operationsFixtures';
import { itemFixture, planFixture } from '../../test/planFixtures';
import { CampaignDetailView } from '../campaigns/CampaignDetailPage';
import type { ContentListActions } from '../operations/ContentList';
import { CampaignSummaryView } from './CampaignSummary';
import { ContentPlannerView, GenerationError } from './ContentPlannerPage';
import { ContentPlanView } from './ContentPlanPage';
import { GeneratePlanForm } from './GeneratePlanForm';
import { PixelThinkingView } from './PixelThinking';
import { PlanItemCard, type PlanItemActions } from './PlanItemCard';
import {
  defaultGenerateForm,
  generateFormToInput,
  PERSONAL_PLANNER_COPY,
  plannerCopy,
  regenerateInput,
} from './plannerLogic';

const base = `/workspace/${WORKSPACE_ID}`;
const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ok = <T,>(data: T): ResourceState<T> => ({ status: 'success', data });
const actions: PlanItemActions = { onAccept: noop, onReject: noop, onRestore: noop, onSave: noop };
const contentActions: ContentListActions = { onMove: noop, onSave: noop, onDelete: noop };

const tinto = campaignFixture();
const overview = (type: 'personal' | 'enterprise') =>
  ({
    workspace: {
      id: WORKSPACE_ID,
      ownerId: WORKSPACE_ID,
      type,
      name: type === 'personal' ? 'Jhon' : 'Pixel de empresa',
      slug: type,
      status: 'active',
      timezone: null,
      createdAt: tinto.createdAt,
      updatedAt: tinto.updatedAt,
    },
    company:
      type === 'enterprise'
        ? {
            id: '64b7f0c2a1b2c3d4e5f60101',
            workspaceId: WORKSPACE_ID,
            ownerId: WORKSPACE_ID,
            name: 'TINTO',
            slug: 'tinto',
            industry: 'Café',
            description: '',
            logoUrl: null,
            status: 'ready',
            brandDnaVersion: 1,
            avatarVersion: 1,
            createdAt: tinto.createdAt,
            updatedAt: tinto.updatedAt,
          }
        : null,
    personal: null,
  }) satisfies WorkspaceOverview;

const enterpriseCopy = plannerCopy(overview('enterprise'));

const enterprisePlan = planFixture({
  contextType: 'enterprise',
  name: 'Lanzamiento TINTO 500 g · Octubre',
  personalDnaVersion: null,
  brandDnaVersion: 1,
  campaignId: CAMPAIGN_ID,
  campaignStrategyVersion: 2,
  strategySummary: 'El plan desarrolla la campaña desde el origen.',
  editorialObjective: 'Presentar la nueva presentación desde el origen',
  campaignAlignment: 'Cada pieza parte de un pilar de la estrategia.',
  distributionRationale: 'Abre con la pieza hero y cierra con el producto.',
  pillars: [
    { name: 'Origen', rationale: 'Mostrar la finca.' },
    { name: 'Producto', rationale: 'La nueva presentación.' },
  ],
  generation: { ...planFixture().generation!, mode: 'demo' },
});
const enterpriseItem = itemFixture({
  title: 'Reel hero — del origen a la mesa',
  campaignId: CAMPAIGN_ID,
  campaignDeliverableId: deliverableFixture().id,
  strategicRole: 'launch',
  funnelStage: 'awareness',
  strategicMessage: 'El mismo origen, en cada taza.',
  brandRationale: 'Usa madera y luz natural porque el ADN prioriza el origen.',
  suggestedAngle: 'Plano cenital de la finca',
  pillar: 'Origen',
});

describe('Copy por tipo de Pixel', () => {
  it('Enterprise nombra a la empresa; Personal conserva sus textos', () => {
    expect(enterpriseCopy.title).toBe('Plan de contenido de TINTO');
    expect(enterpriseCopy.thinking.title).toBe(
      'Pixel está construyendo el plan editorial de TINTO…',
    );
    expect(plannerCopy(overview('personal'))).toBe(PERSONAL_PLANNER_COPY);
  });
});

describe('Inicio del planner Enterprise', () => {
  const view = (plans: ReturnType<typeof planFixture>[]) =>
    text(
      render(
        <ContentPlannerView
          base={base}
          copy={enterpriseCopy}
          state={ok({ plans, total: plans.length })}
          campaigns={[tinto]}
          onRetry={() => {}}
          creating={false}
          onCreate={() => {}}
          onCreateManual={() => {}}
          generator={null}
        />,
      ),
    );

  it('vacío: con Pixel o manual, y la opción de partir de una campaña', () => {
    const plain = view([]);
    expect(plain).toContain('Plan de contenido de TINTO');
    expect(plain).toContain('Aún no tienes un plan de contenido.');
    expect(plain).toContain('desde el ADN de la marca');
    expect(plain).toContain('convertir una estrategia de campaña en un plan editorial');
    expect(plain).toContain('Opciones avanzadas');
    expect(plain).toContain('Nuevo plan');
  });

  it('planes existentes con su periodo y su campaña vinculada', () => {
    const plain = view([enterprisePlan]);
    expect(plain).toContain('Lanzamiento TINTO 500 g · Octubre');
    expect(plain).toContain('Campaña · Lanzamiento TINTO 500 g · estrategia v2');
    expect(plain).toContain('Borrador');
  });
});

describe('Formulario: campaña opcional', () => {
  const form = (campaigns?: ReturnType<typeof campaignFixture>[], initialCampaignId = '') =>
    text(
      render(
        <GeneratePlanForm
          busy={false}
          copy={campaigns ? enterpriseCopy : PERSONAL_PLANNER_COPY}
          campaigns={campaigns}
          initialCampaignId={initialCampaignId}
          campaignSummary={(campaign) => (
            <CampaignSummaryView campaign={campaign} concept="Del origen a la mesa" />
          )}
          onGenerate={() => {}}
        />,
      ),
    );

  it('Enterprise: "¿Quieres basar este plan en una campaña?" con solo sus campañas', () => {
    const plain = form([tinto]);
    expect(plain).toContain('¿Quieres basar este plan en una campaña?');
    expect(plain).toContain('Sin campaña');
    expect(plain).toContain('Lanzamiento TINTO 500 g');
    expect(plain).toContain('Objetivo editorial (opcional)');
    expect(plain).toContain('3 por semana (por defecto)');
    expect(plain).not.toContain('Concepto'); // sin campaña elegida no hay resumen
  });

  it('con una campaña preseleccionada muestra su resumen compacto', () => {
    const plain = form([tinto], CAMPAIGN_ID);
    for (const label of ['Campaña', 'Objetivo', 'Concepto', 'Mensaje principal', 'Periodo']) {
      expect(plain).toContain(label);
    }
    expect(plain).toContain('Del origen a la mesa');
    expect(plain).toContain('Café TINTO 500 g: el mismo origen.');
    expect(plain).not.toContain('Dirección visual'); // nunca la estrategia entera
  });

  it('Personal no ve selector de campaña', () => {
    const plain = form(undefined);
    expect(plain).not.toContain('¿Quieres basar este plan en una campaña?');
    expect(plain).toContain('Según mi ADN');
  });

  it('la petición lleva el campaignId elegido (y regenerar lo conserva)', () => {
    const result = generateFormToInput({ ...defaultGenerateForm(), campaignId: CAMPAIGN_ID });
    expect(result.ok && result.input.campaignId).toBe(CAMPAIGN_ID);
    expect(regenerateInput(enterprisePlan).campaignId).toBe(CAMPAIGN_ID);
    expect('campaignId' in regenerateInput(planFixture())).toBe(false);
  });
});

describe('Generando y errores', () => {
  it('pensando: "Pixel está construyendo el plan editorial de TINTO…" sin progreso falso', () => {
    const html = render(<PixelThinkingView avatar={null} copy={enterpriseCopy.thinking} />);
    expect(text(html)).toContain('Pixel está construyendo el plan editorial de TINTO…');
    expect(html).not.toMatch(/progressbar|%/);
  });

  it('sin ADN o sin estrategia de campaña: el motivo y a dónde ir', () => {
    const noDna = new ApiRequestError(409, 'CONFLICT', 'Sin ADN', { reason: 'brand_dna_missing' });
    expect(
      text(render(<GenerationError error={noDna} base={base} companyHome="/company/c1" />)),
    ).toContain('Completar el onboarding de la marca');
    const noStrategy = new ApiRequestError(409, 'CONFLICT', 'Sin estrategia', {
      reason: 'campaign_strategy_missing',
    });
    const plain = text(render(<GenerationError error={noStrategy} base={base} />));
    expect(plain).toContain('La campaña aún no tiene estrategia');
    expect(plain).toContain('Ir a Campañas');
  });
});

describe('Plan Enterprise: dirección editorial antes que las piezas', () => {
  const plan = (campaignVersion = 2) =>
    render(
      <ContentPlanView
        base={base}
        copy={enterpriseCopy}
        campaign={campaignFixture({ currentStrategyVersion: campaignVersion })}
        state={ok({ plan: enterprisePlan, items: [enterpriseItem] })}
        projects={[]}
        onRetry={() => {}}
        actions={actions}
        regenerating={false}
        regenerateSlot={null}
        onRegenerate={() => {}}
        onStatus={noop}
      />,
    );

  it('orden: Estrategia editorial → Alineación con la campaña → Pilares → Plan de contenido', () => {
    const html = plan();
    const plain = text(html);
    const order = [
      'aria-label="Estrategia"',
      'aria-label="Alineación con la campaña"',
      'aria-label="Pilares"',
      'aria-label="Propuestas"',
    ].map((label) => html.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    for (const label of ['Estrategia editorial', 'Qué vamos a comunicar', 'Cómo se distribuye']) {
      expect(plain).toContain(label);
    }
    expect(plain).toContain('Creado desde la estrategia de campaña v2.');
    expect(plain).toContain('ADN de la marca, la campaña y sus proyectos');
  });

  it('avisa si la campaña tiene una estrategia más reciente (sin cambiar el plan)', () => {
    expect(text(plan(3))).toContain('Existe una estrategia de campaña más reciente (v3)');
    expect(text(plan(2))).not.toContain('más reciente');
  });

  it('la tarjeta: rol, mensaje, ángulo, porqué y porqué de marca; insignias humanas', () => {
    const html = render(
      <PlanItemCard
        item={enterpriseItem}
        projectName={projectFixture().name}
        contentHref={`${base}/content`}
        actions={actions}
        campaign={{ name: tinto.name, href: `${base}/campaigns/${CAMPAIGN_ID}` }}
      />,
    );
    const plain = text(html);
    for (const label of [
      'Sugerida',
      'Reel hero — del origen a la mesa',
      'Instagram',
      'Pilar',
      'Rol estratégico',
      'Lanzamiento · Descubrimiento',
      'Objetivo',
      'Mensaje: El mismo origen, en cada taza.',
      'Ángulo sugerido',
      'Plano cenital de la finca',
      'Por qué Pixel lo recomienda',
      'Por qué encaja con la marca',
      'Usa madera y luz natural',
      'Campaña · Lanzamiento TINTO 500 g',
      'Pieza de campaña',
      'Aceptar',
      'Editar',
      'Rechazar',
    ]) {
      expect(plain).toContain(label);
    }
    expect(html).toContain(`href="${base}/campaigns/${CAMPAIGN_ID}"`);
    expect(plain).not.toContain(deliverableFixture().id); // nunca ids técnicos
  });

  it('aceptada: "Añadido a Contenido" con enlace', () => {
    const plain = text(
      render(
        <PlanItemCard
          item={{
            ...enterpriseItem,
            status: 'converted',
            convertedContentItemId: contentFixture().id,
          }}
          projectName={null}
          contentHref={`${base}/content`}
          actions={actions}
        />,
      ),
    );
    expect(plain).toContain('Añadido a Contenido');
    expect(plain).toContain('Ver en Contenido');
    expect(plain).not.toContain('Aceptar');
  });
});

describe('Detalle de campaña: sus planes de contenido', () => {
  it('lista los planes con propuestas, convertidas y rechazadas, y el CTA preselecciona la campaña', () => {
    const html = render(
      <CampaignDetailView
        base={base}
        campaign={ok(tinto)}
        strategy={ok({ strategy: strategyFixture(), versions: [1] })}
        deliverables={ok([deliverableFixture()])}
        projects={ok({ projects: [], total: 0 })}
        content={ok({ contentItems: [], total: 0 })}
        plans={ok({ plans: [enterprisePlan], total: 1 })}
        tab="plans"
        onTabChange={() => {}}
        onRetry={() => {}}
        deliverableActions={{ onAccept: noop, onReject: noop, onSave: noop }}
        contentActions={contentActions}
        onVersionChange={() => {}}
        onStatusChange={noop}
        regenerating={false}
        regenerateError={null}
        thinking={null}
        onRegenerate={() => {}}
      />,
    );
    const plain = text(html);
    expect(plain).toContain('Plan de contenido');
    expect(plain).toContain('Lanzamiento TINTO 500 g · Octubre');
    expect(plain).toContain('1 propuestas · 1 convertidas · 1 rechazadas');
    expect(plain).toContain('estrategia v2');
    expect(html).toContain(`href="${base}/content-planner?campaign=${CAMPAIGN_ID}"`);
    expect(html).toContain(`href="${base}/content-planner/${enterprisePlan.id}"`);
  });
});
