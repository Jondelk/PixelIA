import type { Project, TaskListResponse } from '@pixel/contracts';
import { useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { useResource, type ResourceState } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { todayInput } from './dates';
import { QuickTask } from './QuickTask';
import { taskListActions } from './taskActions';
import { TaskList, type TaskListActions } from './TaskList';
import { listTasks } from './tasksApi';
import { operationsCopy, PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import {
  DEFAULT_TASK_VIEW,
  isTaskView,
  overdueFilters,
  TASK_VIEWS,
  taskViewFilters,
  type TaskView,
} from './taskViews';
import { Flash, InlineEmpty, LoadingBlock, SectionHeading, Segmented } from './ui';
import { useFlash } from './useFlash';
import { useWorkspaceProjects } from './useProjects';

/** /workspace/:workspaceId/tasks — Inbox, Hoy, Próximas, Todas y Completadas. */
export function TasksPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('view');
  const view: TaskView = isTaskView(raw) ? raw : DEFAULT_TASK_VIEW;
  const { flash, show, dismiss } = useFlash();
  const projects = useWorkspaceProjects(workspaceId);

  const tasks = useResource(`tasks:${workspaceId}:${view}`, (signal) =>
    listTasks(workspaceId, { ...taskViewFilters(view), limit: 100 }, signal),
  );
  // "Hoy" muestra arriba lo que ya venció (consulta aparte, solo en esa vista).
  const overdue = useResource(`tasks:${workspaceId}:overdue:${view}`, (signal) =>
    view === 'today'
      ? listTasks(workspaceId, { ...overdueFilters, limit: 100 }, signal)
      : Promise.resolve<TaskListResponse>({ tasks: [], total: 0 }),
  );
  const reloadTasks = tasks.reload;
  const reloadOverdue = overdue.reload;
  const onChanged = useCallback(() => {
    reloadTasks();
    reloadOverdue();
  }, [reloadTasks, reloadOverdue]);

  return (
    <TasksView
      copy={operationsCopy(overview)}
      view={view}
      onViewChange={(next) =>
        setSearchParams(next === DEFAULT_TASK_VIEW ? {} : { view: next }, { replace: true })
      }
      tasks={tasks.state}
      overdue={overdue.state}
      projects={projects.all}
      onRetry={onChanged}
      flash={<Flash message={flash?.message ?? null} action={flash?.action} onDismiss={dismiss} />}
      quickTask={
        view !== 'done' && (
          <QuickTask
            key={view}
            workspaceId={workspaceId}
            projects={projects.assignable}
            defaultDueDate={view === 'today' ? todayInput() : ''}
            onCreated={(task) => {
              onChanged();
              show(`Tarea creada: ${task.title}`);
            }}
          />
        )
      }
      actions={taskListActions(workspaceId, { onChanged, notify: show })}
    />
  );
}

export function TasksView({
  view,
  onViewChange,
  tasks,
  overdue,
  projects,
  onRetry,
  flash,
  quickTask,
  actions,
  copy = PERSONAL_OPERATIONS_COPY,
}: {
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  tasks: ResourceState<TaskListResponse>;
  overdue: ResourceState<TaskListResponse>;
  projects: readonly Project[];
  onRetry: () => void;
  flash?: ReactNode;
  quickTask: ReactNode;
  actions: TaskListActions;
  copy?: OperationsCopy;
}) {
  const definition = TASK_VIEWS.find((item) => item.id === view) ?? TASK_VIEWS[0]!;
  const overdueTasks = overdue.status === 'success' ? overdue.data.tasks : [];

  return (
    <>
      <PageHeader eyebrow="Trabajo" title="Tareas" description={copy.tasks.description} />
      {flash}
      <div className="mb-6">
        <Segmented
          label="Vista de tareas"
          options={TASK_VIEWS}
          value={view}
          onChange={onViewChange}
        />
      </div>
      {quickTask && <div className="mb-8">{quickTask}</div>}

      {tasks.status === 'loading' && <LoadingBlock label="Cargando tareas…" />}
      {tasks.status === 'error' && <ErrorState error={tasks.error} onRetry={onRetry} />}
      {tasks.status === 'success' && (
        <>
          {overdueTasks.length > 0 && (
            <section className="mb-10" aria-label="Vencidas">
              <SectionHeading
                title="Vencidas"
                count={overdue.status === 'success' ? overdue.data.total : undefined}
              />
              <TaskList tasks={overdueTasks} projects={projects} actions={actions} />
            </section>
          )}
          {tasks.data.tasks.length === 0 ? (
            view === 'all' && overdueTasks.length === 0 ? (
              <EmptyState title={copy.tasks.emptyTitle} description={copy.tasks.emptyDescription} />
            ) : (
              <InlineEmpty>{definition.empty}</InlineEmpty>
            )
          ) : (
            <section aria-label={definition.label}>
              {view === 'today' && overdueTasks.length > 0 && (
                <SectionHeading title="Hoy" count={tasks.data.total} />
              )}
              <TaskList tasks={tasks.data.tasks} projects={projects} actions={actions} />
              {tasks.data.total > tasks.data.tasks.length && (
                <p className="mt-4 text-xs text-subtle">
                  Mostrando {tasks.data.tasks.length} de {tasks.data.total}.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
