import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ContentItem,
  type ContentItemListResponse,
  type Project,
  type Task,
  type TaskListResponse,
} from '@pixel/contracts';
import { useCallback, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { workspaceBasePath } from '../../app/navigation';
import { ApiRequestError, errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { ContentForm } from './ContentForm';
import { ContentList, type ContentListActions } from './ContentList';
import { contentListActions } from './contentActions';
import { createContentItem, listContent } from './contentApi';
import { formatLongDate } from './dates';
import { operationsCopy, PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import { projectToForm } from './operationsForms';
import { ProjectForm } from './ProjectForm';
import { archiveProject, getProject, updateProject } from './projectsApi';
import { QuickTask } from './QuickTask';
import { taskListActions } from './taskActions';
import { TaskList, type TaskListActions } from './TaskList';
import { listTasks } from './tasksApi';
import { Flash, InlineEmpty, LoadingBlock, PriorityMark, ProgressBar, SectionHeading } from './ui';
import { useFlash } from './useFlash';

/** /workspace/:workspaceId/projects/:projectId — el proyecto con sus tareas y su contenido. */
export function ProjectDetailPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const { projectId = '' } = useParams();
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;
  const { flash, show, dismiss } = useFlash(justCreated ? 'Proyecto creado' : undefined);
  const [editing, setEditing] = useState(false);
  const [addingContent, setAddingContent] = useState(false);
  const copy = operationsCopy(overview);

  const key = `${workspaceId}:${projectId}`;
  const project = useResource(`project:${key}`, (signal) =>
    getProject(workspaceId, projectId, signal),
  );
  // Una petición por colección (filtrada por proyecto): sin N+1.
  const tasks = useResource(`project-tasks:${key}`, (signal) =>
    listTasks(workspaceId, { projectId, limit: 100 }, signal),
  );
  const content = useResource(`project-content:${key}`, (signal) =>
    listContent(workspaceId, { projectId, limit: 100 }, signal),
  );
  const reloadProject = project.reload;
  const reloadTasks = tasks.reload;
  const reloadContent = content.reload;
  const onTasksChanged = useCallback(() => {
    reloadTasks();
    reloadProject();
  }, [reloadTasks, reloadProject]);
  const onContentChanged = useCallback(() => {
    reloadContent();
    reloadProject();
  }, [reloadContent, reloadProject]);

  const base = workspaceBasePath(workspaceId);
  const current = project.state.status === 'success' ? project.state.data : null;

  return (
    <ProjectDetailView
      copy={copy}
      base={base}
      project={project.state}
      tasks={tasks.state}
      content={content.state}
      onRetry={() => {
        project.reload();
        tasks.reload();
        content.reload();
      }}
      flash={<Flash message={flash?.message ?? null} action={flash?.action} onDismiss={dismiss} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      editor={
        current && (
          <ProjectForm
            copy={copy.projectForm}
            initial={projectToForm(current)}
            submitLabel="Guardar"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await updateProject(workspaceId, current.id, input);
              setEditing(false);
              project.reload();
              show('Proyecto guardado');
            }}
          />
        )
      }
      onArchiveToggle={async () => {
        if (!current) return;
        if (current.status === 'archived') {
          await updateProject(workspaceId, current.id, { status: 'active' });
          show('Proyecto reactivado');
        } else {
          await archiveProject(workspaceId, current.id);
          show('Proyecto archivado: sus tareas y contenido se conservan');
        }
        project.reload();
      }}
      quickTask={
        current && (
          <QuickTask
            workspaceId={workspaceId}
            projectId={current.id}
            onCreated={(task) => {
              onTasksChanged();
              show(`Tarea creada: ${task.title}`);
            }}
          />
        )
      }
      taskActions={taskListActions(workspaceId, { onChanged: onTasksChanged, notify: show })}
      addingContent={addingContent}
      onAddContent={() => setAddingContent(true)}
      contentForm={
        current && (
          <ContentForm
            titlePlaceholder={copy.content.titlePlaceholder}
            projects={[current]}
            fixedProjectId={current.id}
            submitLabel="Crear contenido"
            onCancel={() => setAddingContent(false)}
            onSubmit={async (input) => {
              const item = await createContentItem(workspaceId, input);
              setAddingContent(false);
              onContentChanged();
              show(`Contenido creado: ${item.title}`);
            }}
          />
        )
      }
      contentActions={contentListActions(workspaceId, {
        onChanged: onContentChanged,
        notify: show,
      })}
    />
  );
}

export function ProjectDetailView({
  base,
  project,
  tasks,
  content,
  onRetry,
  flash,
  editing,
  onEdit,
  editor,
  onArchiveToggle,
  quickTask,
  taskActions,
  addingContent,
  onAddContent,
  contentForm,
  contentActions,
  copy = PERSONAL_OPERATIONS_COPY,
}: {
  base: string;
  project: ResourceState<Project>;
  tasks: ResourceState<TaskListResponse>;
  content: ResourceState<ContentItemListResponse>;
  onRetry: () => void;
  flash?: ReactNode;
  editing: boolean;
  onEdit: () => void;
  editor: ReactNode;
  onArchiveToggle: () => Promise<void>;
  quickTask: ReactNode;
  taskActions: TaskListActions;
  addingContent: boolean;
  onAddContent: () => void;
  contentForm: ReactNode;
  contentActions: ContentListActions;
  copy?: OperationsCopy;
}) {
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<unknown>(null);
  const backLink = (
    <Link
      to={`${base}/projects`}
      className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
    >
      <Icon name="arrowLeft" className="size-4" /> Proyectos
    </Link>
  );

  if (project.status === 'loading') return <LoadingBlock label="Cargando proyecto…" />;
  if (project.status === 'error') {
    // Inexistente o de otro workspace: la API responde 404 y aquí no se muestra nada de él.
    if (project.error instanceof ApiRequestError && project.error.status === 404) {
      return (
        <>
          <PageHeader
            eyebrow="404"
            title="Proyecto no encontrado"
            description="No existe en este Pixel o ya no tienes acceso a él."
          />
          <Link to={`${base}/projects`} className={buttonClasses('secondary')}>
            Ver proyectos
          </Link>
        </>
      );
    }
    return <ErrorState error={project.error} onRetry={onRetry} />;
  }

  const data = project.data;
  const archived = data.status === 'archived';

  return (
    <>
      <div className="mb-8">{backLink}</div>
      {flash}

      {editing ? (
        <div className="mb-12">{editor}</div>
      ) : (
        <header className="mb-12">
          <p className="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            <span>{PROJECT_STATUS_LABELS[data.status]}</span>
            <span aria-hidden="true">·</span>
            <span>{PROJECT_TYPE_LABELS[data.type]}</span>
          </p>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <h1 className="max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
              {data.name}
            </h1>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onEdit}>
                <Icon name="pencil" className="size-4" /> Editar
              </Button>
              <Button
                variant="ghost"
                loading={archiving}
                onClick={() => {
                  setArchiving(true);
                  setArchiveError(null);
                  onArchiveToggle()
                    .catch(setArchiveError)
                    .finally(() => setArchiving(false));
                }}
              >
                {archived ? 'Reactivar' : 'Archivar'}
              </Button>
            </div>
          </div>
          {archiveError !== null && (
            <div className="mt-5">
              <Alert>{errorMessage(archiveError)}</Alert>
            </div>
          )}
          {data.description && (
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted">
              {data.description}
            </p>
          )}

          <dl className="mt-8 grid gap-6 border-y border-line py-6 sm:grid-cols-4">
            <Meta label="Prioridad">
              <PriorityMark priority={data.priority} />
            </Meta>
            <Meta label="Inicio">{data.startDate ? formatLongDate(data.startDate) : '—'}</Meta>
            <Meta label="Fecha límite">{data.dueDate ? formatLongDate(data.dueDate) : '—'}</Meta>
            <Meta label="Avance">
              <ProgressBar
                value={data.progress}
                label={`${data.stats.completedTasks} de ${data.stats.tasks} tareas`}
              />
            </Meta>
          </dl>

          {data.goals.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
                Objetivos
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.goals.map((goal) => (
                  <li key={goal} className="flex gap-3 text-sm text-fg">
                    <span className="mt-2 size-1 shrink-0 bg-fg" aria-hidden="true" />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </header>
      )}

      <section className="mb-14" aria-label="Tareas del proyecto">
        <SectionHeading
          title="Tareas"
          count={tasks.status === 'success' ? tasks.data.total : undefined}
        />
        <div className="mb-4">{quickTask}</div>
        <ProjectTasks tasks={tasks} project={data} actions={taskActions} onRetry={onRetry} />
      </section>

      <section aria-label="Contenido del proyecto">
        <SectionHeading
          title="Contenido"
          count={content.status === 'success' ? content.data.total : undefined}
          action={
            !addingContent && (
              <Button variant="secondary" onClick={onAddContent}>
                <Icon name="plus" className="size-4" /> Nuevo contenido
              </Button>
            )
          }
        />
        {addingContent && <div className="mb-4">{contentForm}</div>}
        <ProjectContent
          content={content}
          project={data}
          actions={contentActions}
          onRetry={onRetry}
          empty={copy.projectDetail.contentEmpty}
        />
      </section>
    </>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{label}</dt>
      <dd className="mt-2 text-sm text-fg">{children}</dd>
    </div>
  );
}

function ProjectTasks({
  tasks,
  project,
  actions,
  onRetry,
}: {
  tasks: ResourceState<TaskListResponse>;
  project: Project;
  actions: TaskListActions;
  onRetry: () => void;
}) {
  if (tasks.status === 'loading') return <LoadingBlock label="Cargando tareas…" />;
  if (tasks.status === 'error') {
    return (
      <ErrorState error={tasks.error} onRetry={onRetry} title="No pudimos cargar las tareas" />
    );
  }
  if (tasks.data.tasks.length === 0) {
    return <InlineEmpty>Este proyecto aún no tiene tareas. Escribe la primera arriba.</InlineEmpty>;
  }
  return (
    <TaskList
      tasks={sortProjectTasks(tasks.data.tasks)}
      projects={[project]}
      showProject={false}
      actions={actions}
    />
  );
}

/** Pendientes primero; completadas y canceladas al final. */
function sortProjectTasks(tasks: readonly Task[]): Task[] {
  const closed = (task: Task) => (task.status === 'done' || task.status === 'cancelled' ? 1 : 0);
  return [...tasks].sort((a, b) => closed(a) - closed(b));
}

function ProjectContent({
  content,
  project,
  actions,
  onRetry,
  empty,
}: {
  content: ResourceState<ContentItemListResponse>;
  project: Project;
  actions: ContentListActions;
  onRetry: () => void;
  empty: string;
}) {
  if (content.status === 'loading') return <LoadingBlock label="Cargando contenido…" />;
  if (content.status === 'error') {
    return (
      <ErrorState error={content.error} onRetry={onRetry} title="No pudimos cargar el contenido" />
    );
  }
  const items: ContentItem[] = content.data.contentItems;
  if (items.length === 0) {
    return <InlineEmpty>{empty}</InlineEmpty>;
  }
  return (
    <ContentList
      items={items}
      projects={[project]}
      fixedProjectId={project.id}
      showStatus
      showProject={false}
      actions={actions}
    />
  );
}
