import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import type { ResourceState } from '../../lib/useResource';
import { contentFixture, noop, projectFixture, taskFixture } from '../../test/operationsFixtures';
import { ContentView } from './ContentPage';
import type { ContentListActions } from './ContentList';
import { OperationsOverviewView } from './OperationsOverview';
import { ProjectDetailView } from './ProjectDetailPage';
import { ProjectsView } from './ProjectsPage';
import type { TaskListActions } from './TaskList';
import { TasksView } from './TasksPage';

const base = '/workspace/w1';
const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const ok = <T,>(data: T): ResourceState<T> => ({ status: 'success', data });
const loading: ResourceState<never> = { status: 'loading' };
const failed = (status = 500, message = 'El servidor no respondió'): ResourceState<never> => ({
  status: 'error',
  error: new ApiRequestError(status, status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message),
});
const taskActions: TaskListActions = { onToggle: noop, onSave: noop, onDelete: noop };
const contentActions: ContentListActions = { onMove: noop, onSave: noop, onDelete: noop };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Proyectos', () => {
  const view = (
    state: ResourceState<{ projects: ReturnType<typeof projectFixture>[]; total: number }>,
    form: ReactNode = null,
  ) =>
    render(
      <ProjectsView
        base={base}
        state={state}
        filter="all"
        onFilterChange={() => {}}
        onRetry={() => {}}
        onNew={() => {}}
        form={form}
      />,
    );

  it('estado vacío con su llamada a crear el primero', () => {
    const html = text(view(ok({ projects: [], total: 0 })));
    expect(html).toContain('Todavía no tienes proyectos.');
    expect(html).toContain('Crea uno para reunir tareas y contenido');
    expect(html).toContain('Nuevo proyecto');
  });

  it('tarjetas con estado, progreso calculado y conteos reales', () => {
    const html = view(ok({ projects: [projectFixture()], total: 1 }));
    expect(text(html)).toContain('Marca personal');
    expect(text(html)).toContain('Activo');
    expect(text(html)).toContain('2 tareas');
    expect(text(html)).toContain('1 contenido');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain(`href="${base}/projects/${projectFixture().id}"`);
  });

  it('el error de la API es visible y se puede reintentar', () => {
    const html = text(view(failed()));
    expect(html).toContain('No pudimos cargar la información');
    expect(html).toContain('El servidor no respondió');
    expect(html).toContain('Reintentar');
  });

  it('muestra un estado de carga, nunca una pantalla en silencio', () => {
    expect(text(view(loading))).toContain('Cargando proyectos…');
  });
});

describe('Detalle de proyecto', () => {
  const project = projectFixture();
  const detail = (overrides: Partial<Parameters<typeof ProjectDetailView>[0]> = {}) =>
    render(
      <ProjectDetailView
        base={base}
        project={ok(project)}
        tasks={ok({
          tasks: [
            taskFixture({ title: 'Escribir guion', projectId: project.id }),
            taskFixture({
              id: '64b7f0c2a1b2c3d4e5f60021',
              title: 'Elegir música',
              projectId: project.id,
              status: 'done',
            }),
          ],
          total: 2,
        })}
        content={ok({
          contentItems: [contentFixture({ title: 'Reel del proceso', projectId: project.id })],
          total: 1,
        })}
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
        {...overrides}
      />,
    );

  it('muestra sus datos, sus tareas y su contenido', () => {
    const html = detail();
    const plain = text(html);
    expect(plain).toContain('Marca personal');
    expect(plain).toContain('Publicar 3 veces por semana');
    expect(plain).toContain('1 de 2 tareas');
    expect(plain).toContain('Escribir guion');
    expect(plain).toContain('Elegir música');
    expect(plain).toContain('Reel del proceso');
    expect(plain).toContain('Pasar a Revisión');
    expect(html).toContain('aria-label="Tareas del proyecto"');
    expect(html).toContain('aria-label="Contenido del proyecto"');
  });

  it('las tareas completadas van al final y quedan marcadas', () => {
    const html = detail();
    expect(html.indexOf('Escribir guion')).toBeLessThan(html.indexOf('Elegir música'));
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Reabrir: Elegir música');
    expect(html).toContain('Completar: Escribir guion');
  });

  it('sin tareas ni contenido, lo dice', () => {
    const plain = text(
      detail({
        tasks: ok({ tasks: [], total: 0 }),
        content: ok({ contentItems: [], total: 0 }),
      }),
    );
    expect(plain).toContain('Este proyecto aún no tiene tareas');
    expect(plain).toContain('Tu próxima idea para este proyecto puede empezar aquí.');
  });

  it('un proyecto de otro workspace (404) no expone ningún dato', () => {
    const html = text(
      detail({
        project: failed(404, 'Proyecto no encontrado'),
        tasks: ok({ tasks: [taskFixture({ title: 'Tarea ajena' })], total: 1 }),
      }),
    );
    expect(html).toContain('Proyecto no encontrado');
    expect(html).not.toContain('Tarea ajena');
    expect(html).not.toContain('Marca personal');
  });

  it('un error de carga de tareas es visible', () => {
    expect(text(detail({ tasks: failed() }))).toContain('No pudimos cargar las tareas');
  });
});

describe('Tareas', () => {
  const tasksView = (
    tasks: ResourceState<{ tasks: ReturnType<typeof taskFixture>[]; total: number }>,
    view: 'all' | 'today' = 'all',
  ) =>
    render(
      <TasksView
        view={view}
        onViewChange={() => {}}
        tasks={tasks}
        overdue={ok({ tasks: [], total: 0 })}
        projects={[projectFixture()]}
        onRetry={() => {}}
        quickTask={<p>quick-task</p>}
        actions={taskActions}
      />,
    );

  it('cada fila: checkbox, título, proyecto, prioridad y fecha', () => {
    const html = tasksView(
      ok({
        tasks: [
          taskFixture({
            projectId: projectFixture().id,
            priority: 'high',
            dueDate: new Date().toISOString(),
          }),
        ],
        total: 1,
      }),
    );
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="false"');
    expect(text(html)).toContain('Grabar intro');
    expect(text(html)).toContain('Marca personal');
    expect(text(html)).toContain('Hoy');
    expect(html).toContain('Prioridad alta');
    expect(text(html)).toContain('quick-task');
  });

  it('estado vacío de la vista "Todas"', () => {
    expect(text(tasksView(ok({ tasks: [], total: 0 })))).toContain('No tienes tareas pendientes.');
    expect(text(tasksView(ok({ tasks: [], total: 0 }), 'today'))).toContain('Nada vence hoy.');
  });

  it('el error de la API es visible', () => {
    expect(text(tasksView(failed()))).toContain('Reintentar');
  });
});

describe('Contenido', () => {
  const contentView = (
    items: ReturnType<typeof contentFixture>[],
    stage: 'idea' | 'production' = 'idea',
  ) =>
    render(
      <ContentView
        stage={stage}
        onStageChange={() => {}}
        pipeline={ok({ contentItems: items, total: items.length })}
        archived={ok({ contentItems: [], total: 0 })}
        projects={[]}
        onRetry={() => {}}
        creating={false}
        onNew={() => {}}
        form={null}
        actions={contentActions}
      />,
    );

  it('estado vacío', () => {
    expect(text(contentView([]))).toContain('Tu próxima idea puede empezar aquí.');
  });

  it('pipeline con conteos por etapa y la etapa elegida', () => {
    const html = text(
      contentView(
        [
          contentFixture(),
          contentFixture({ id: '64b7f0c2a1b2c3d4e5f60031', title: 'Idea suelta', status: 'idea' }),
        ],
        'production',
      ),
    );
    expect(html).toMatch(/Ideas 1/);
    expect(html).toMatch(/Producción 1/);
    expect(html).toContain('Cómo construí Pixel Personal');
    expect(html).not.toContain('Idea suelta');
    expect(html).toContain('Instagram · Reel');
  });
});

describe('Inicio: resumen operacional', () => {
  it('solo conteos y elementos reales', () => {
    const html = text(
      render(
        <OperationsOverviewView
          base={base}
          onRetry={() => {}}
          state={ok({
            counts: {
              activeProjects: 5,
              openTasks: 12,
              overdueTasks: 2,
              contentInProduction: 3,
              activeContentItems: 6,
            },
            upcomingTasks: [taskFixture({ dueDate: new Date().toISOString() })],
            recentProjects: [projectFixture()],
            upcomingContent: [],
          })}
        />,
      ),
    );
    expect(html).toContain('Proyectos activos 5');
    expect(html).toContain('Tareas pendientes 12');
    expect(html).toContain('2 vencidas');
    expect(html).toContain('Contenido en producción 3');
    expect(html).toContain('Grabar intro');
    expect(html).toContain('Sin contenido con fecha prevista.');
    expect(html).not.toMatch(/Pixel recomienda/i);
  });
});
