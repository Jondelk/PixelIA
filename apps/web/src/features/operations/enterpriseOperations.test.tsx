import type { Company, WorkspaceOverview } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ResourceState } from '../../lib/useResource';
import { contentFixture, noop, projectFixture, WORKSPACE_ID } from '../../test/operationsFixtures';
import { BrandWorkHeading } from '../companies/BrandWorkSection';
import type { CompanyOutletContext } from '../companies/companyContext';
import { CompanyOverviewPage } from '../companies/CompanyOverviewPage';
import { FeatureOnly } from '../workspaces/FeatureOnly';
import type { WorkspaceOutletContext } from '../workspaces/workspaceContext';
import { ContentView } from './ContentPage';
import type { ContentListActions } from './ContentList';
import { OperationsOverviewView } from './OperationsOverview';
import {
  enterpriseOperationsCopy,
  operationsCopy,
  PERSONAL_OPERATIONS_COPY,
} from './operationsCopy';
import { ProjectDetailView } from './ProjectDetailPage';
import { ProjectForm } from './ProjectForm';
import { ProjectsView } from './ProjectsPage';
import type { TaskListActions } from './TaskList';
import { TasksView } from './TasksPage';

const NOW = '2026-10-08T15:00:00.000Z';
const base = `/workspace/${WORKSPACE_ID}`;
const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const ok = <T,>(data: T): ResourceState<T> => ({ status: 'success', data });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const taskActions: TaskListActions = { onToggle: noop, onSave: noop, onDelete: noop };
const contentActions: ContentListActions = { onMove: noop, onSave: noop, onDelete: noop };

const tinto: Company = {
  id: '64b7f0c2a1b2c3d4e5f60101',
  workspaceId: WORKSPACE_ID,
  ownerId: '64b7f0c2a1b2c3d4e5f60201',
  name: 'TINTO',
  slug: 'tinto',
  industry: 'Café de especialidad',
  description: 'Café artesanal colombiano',
  logoUrl: null,
  status: 'ready',
  brandDnaVersion: 1,
  avatarVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

function overviewOf(type: 'personal' | 'enterprise', company: Company | null = null) {
  return {
    workspace: {
      id: WORKSPACE_ID,
      ownerId: tinto.ownerId,
      type,
      name: type === 'personal' ? 'Jhon' : 'Pixel de empresa',
      slug: type,
      status: 'active',
      timezone: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    company,
    personal:
      type === 'personal' ? { name: 'Jhon', completedSteps: 8, personalDnaVersion: 1 } : null,
  } satisfies WorkspaceOverview;
}

const tintoCopy = enterpriseOperationsCopy('TINTO');

describe('Copy de Operations por tipo de workspace', () => {
  it('Personal conserva sus textos; Enterprise nombra la marca', () => {
    expect(operationsCopy(overviewOf('personal'))).toBe(PERSONAL_OPERATIONS_COPY);
    const copy = operationsCopy(overviewOf('enterprise', tinto));
    expect(copy.projects.title).toBe('Proyectos de TINTO');
    expect(copy.projects.emptyDescription).toBe(
      'Crea un proyecto para organizar el trabajo de la marca.',
    );
    // Sin empresa todavía, usa el nombre del workspace.
    expect(operationsCopy(overviewOf('enterprise')).projects.title).toBe(
      'Proyectos de Pixel de empresa',
    );
  });

  it('cada tipo ofrece sus tipos de proyecto y conserva el actual al editar', () => {
    const labels = (options: { label: string }[]) => options.map((option) => option.label);
    const enterprise = labels(tintoCopy.projectForm.typeOptions());
    expect(enterprise).toEqual([
      'General',
      'Contenido',
      'Creativo',
      'Campaña',
      'Branding',
      'Lanzamiento',
      'Evento',
      'Interno',
      'Otro',
    ]);
    expect(labels(PERSONAL_OPERATIONS_COPY.projectForm.typeOptions())).toContain('Estudio');
    expect(labels(PERSONAL_OPERATIONS_COPY.projectForm.typeOptions())).not.toContain('Campaña');
    // Un proyecto con un tipo de fuera de la lista no lo pierde al abrir el editor.
    expect(labels(tintoCopy.projectForm.typeOptions('personal'))).toContain('Personal');
  });
});

describe('Proyectos Enterprise (la misma pantalla, otro copy)', () => {
  const view = (projects: ReturnType<typeof projectFixture>[], form: ReactNode = null) =>
    text(
      render(
        <ProjectsView
          base={base}
          copy={tintoCopy}
          state={ok({ projects, total: projects.length })}
          filter="all"
          onFilterChange={() => {}}
          onRetry={() => {}}
          onNew={() => {}}
          form={form}
        />,
      ),
    );

  it('estado vacío de la marca con su llamada a crear', () => {
    const html = view([]);
    expect(html).toContain('Proyectos de TINTO');
    expect(html).toContain('TINTO aún no tiene proyectos.');
    expect(html).toContain('Crea un proyecto para organizar el trabajo de la marca.');
    expect(html).toContain('Nuevo proyecto');
  });

  it('lista proyectos con progreso derivado de sus tareas', () => {
    const html = view([
      projectFixture({ name: 'Lanzamiento nueva presentación', type: 'product_launch' }),
    ]);
    expect(html).toContain('Lanzamiento nueva presentación');
    expect(html).toContain('Lanzamiento'); // etiqueta del tipo
    expect(html).toContain('2 tareas');
  });

  it('el formulario de creación ofrece los tipos de empresa con general por defecto', () => {
    const html = render(
      <ProjectForm
        copy={tintoCopy.projectForm}
        submitLabel="Crear proyecto"
        onSubmit={noop}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('placeholder="Lanzamiento nueva presentación"');
    expect(html).toContain('Campaña');
    expect(html).toContain('Branding');
    expect(html).not.toContain('>Estudio<');
    expect(html).toContain('<option value="general"');
  });

  it('el detalle muestra datos, tareas y contenido, sin ninguna función de campaña falsa', () => {
    const project = projectFixture({
      name: 'Lanzamiento nueva presentación',
      type: 'campaign',
      goals: ['Presentar el empaque de 500 g'],
    });
    const html = text(
      render(
        <ProjectDetailView
          copy={tintoCopy}
          base={base}
          project={ok(project)}
          tasks={ok({ tasks: [], total: 0 })}
          content={ok({ contentItems: [], total: 0 })}
          onRetry={() => {}}
          editing={false}
          onEdit={() => {}}
          editor={null}
          onArchiveToggle={noop}
          quickTask={null}
          taskActions={taskActions}
          addingContent={false}
          onAddContent={() => {}}
          contentForm={null}
          contentActions={contentActions}
        />,
      ),
    );
    expect(html).toContain('Lanzamiento nueva presentación');
    expect(html).toContain('Presentar el empaque de 500 g');
    expect(html).toContain('La próxima pieza de este proyecto puede empezar aquí.');
    // "Campaña" aparece solo como etiqueta del tipo, nunca como acción o sección.
    expect(html.match(/Campaña/g)).toHaveLength(1);
    expect(html).not.toMatch(/Campaign|Crear campaña|Gestor de campañas/);
  });
});

describe('Tareas y Contenido Enterprise', () => {
  it('Tareas: vistas Inbox, Hoy, Próximas, Todas y Completadas con el copy de la marca', () => {
    const html = text(
      render(
        <TasksView
          copy={tintoCopy}
          view="all"
          onViewChange={() => {}}
          tasks={ok({ tasks: [], total: 0 })}
          overdue={ok({ tasks: [], total: 0 })}
          projects={[]}
          onRetry={() => {}}
          quickTask={null}
          actions={taskActions}
        />,
      ),
    );
    for (const view of ['Inbox', 'Hoy', 'Próximas', 'Todas', 'Completadas']) {
      expect(html).toContain(view);
    }
    expect(html).toContain('Lo que hay que hacer en TINTO');
    expect(html).toContain('No hay tareas pendientes.');
  });

  it('Contenido: el pipeline completo de la idea a la publicación', () => {
    const html = text(
      render(
        <ContentView
          copy={tintoCopy}
          stage="production"
          onStageChange={() => {}}
          pipeline={ok({
            contentItems: [
              contentFixture({
                title: 'Reel lanzamiento nueva presentación',
                status: 'production',
              }),
            ],
            total: 1,
          })}
          archived={ok({ contentItems: [], total: 0 })}
          projects={[]}
          onRetry={() => {}}
          creating={false}
          onNew={() => {}}
          form={null}
          actions={contentActions}
        />,
      ),
    );
    for (const stage of ['Ideas', 'Planificado', 'Producción', 'Revisión', 'Listo', 'Publicado']) {
      expect(html).toContain(stage);
    }
    expect(html).toContain('Cada pieza de la marca');
    expect(html).toContain('Reel lanzamiento nueva presentación');
  });
});

describe('Inicio Enterprise', () => {
  it('Trabajo de la marca: contadores reales y CTA a crear proyecto en el workspace', () => {
    const html = render(
      <>
        <BrandWorkHeading base={base} />
        <OperationsOverviewView
          base={base}
          copy={tintoCopy.overview}
          onRetry={() => {}}
          state={ok({
            counts: {
              activeProjects: 3,
              openTasks: 8,
              overdueTasks: 1,
              contentInProduction: 4,
              activeContentItems: 6,
              activeCampaigns: 0,
            },
            upcomingTasks: [],
            recentProjects: [],
            upcomingContent: [],
          })}
        />
      </>,
    );
    const plain = text(html);
    expect(plain).toContain('Trabajo de la marca');
    expect(plain).toContain('Proyectos activos 3');
    expect(plain).toContain('Tareas pendientes 8');
    expect(plain).toContain('1 vencidas');
    expect(plain).toContain('Contenido en producción 4');
    expect(plain).toContain('Aún no hay proyectos.');
    expect(html).toContain(`href="${base}/projects?new"`);
    expect(html).toContain(`href="${base}/projects?filter=active"`);
    expect(html).toContain('aria-label="Trabajo de la marca"');
    expect(plain).not.toMatch(/Pixel recomienda/);
  });

  it('el resumen de la empresa incluye su trabajo, sin Daily Director ni Plan de contenido', () => {
    const context: CompanyOutletContext = { company: tinto, reload: () => {} };
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/company/${tinto.id}`]}>
        <Routes>
          <Route path="/company/:companyId" element={<Outlet context={context} />}>
            <Route index element={<CompanyOverviewPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const plain = text(html);
    expect(plain).toContain('TINTO');
    expect(plain).toContain('Trabajo de la marca');
    expect(plain).toContain('Proyectos activos');
    expect(html).toContain(`href="/workspace/${WORKSPACE_ID}/projects?new"`);
    expect(plain).not.toMatch(/Tu día|Plan de contenido/);
  });
});

describe('FeatureOnly: rutas según las capacidades del workspace', () => {
  const at = (path: string, overview: WorkspaceOverview) => {
    const context: WorkspaceOutletContext = { overview, reload: () => {} };
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/workspace/:workspaceId" element={<Outlet context={context} />}>
            <Route
              path="projects"
              element={
                <FeatureOnly feature="projects">
                  <p>PROYECTOS</p>
                </FeatureOnly>
              }
            />
            <Route
              path="content-planner"
              element={
                <FeatureOnly feature="contentPlanner">
                  <p>PLANNER</p>
                </FeatureOnly>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  };

  it('Enterprise entra a Proyectos pero no al Plan de contenido', () => {
    const enterprise = overviewOf('enterprise', tinto);
    expect(at(`${base}/projects`, enterprise)).toContain('PROYECTOS');
    expect(at(`${base}/content-planner`, enterprise)).not.toContain('PLANNER');
  });

  it('Personal sigue entrando a ambos', () => {
    const personal = overviewOf('personal');
    expect(at(`${base}/projects`, personal)).toContain('PROYECTOS');
    expect(at(`${base}/content-planner`, personal)).toContain('PLANNER');
  });
});
