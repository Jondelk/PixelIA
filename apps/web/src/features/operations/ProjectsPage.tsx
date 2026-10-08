import type { ProjectListResponse } from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { workspaceBasePath } from '../../app/navigation';
import { useResource, type ResourceState } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { ProjectCard } from './ProjectCard';
import { ProjectForm } from './ProjectForm';
import {
  isProjectFilter,
  PROJECT_FILTERS,
  projectFilterStatuses,
  type ProjectFilter,
} from './projectFilters';
import { operationsCopy, PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import { createProject, listProjects } from './projectsApi';
import { InlineEmpty, LoadingBlock, Segmented } from './ui';

/** /workspace/:workspaceId/projects — la misma pantalla para Personal y Enterprise. */
export function ProjectsPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('filter');
  const filter: ProjectFilter = isProjectFilter(raw) ? raw : 'all';
  const [creating, setCreating] = useState(searchParams.has('new'));
  const { state, reload } = useResource(`projects:${workspaceId}:${filter}`, (signal) =>
    listProjects(workspaceId, { status: projectFilterStatuses(filter), limit: 100 }, signal),
  );
  const base = workspaceBasePath(workspaceId);
  const copy = operationsCopy(overview);

  return (
    <ProjectsView
      base={base}
      copy={copy}
      state={state}
      filter={filter}
      onFilterChange={(next) =>
        setSearchParams(next === 'all' ? {} : { filter: next }, { replace: true })
      }
      onRetry={reload}
      onNew={() => setCreating(true)}
      form={
        creating ? (
          <ProjectForm
            copy={copy.projectForm}
            submitLabel="Crear proyecto"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const project = await createProject(workspaceId, input);
              navigate(`${base}/projects/${project.id}`, { state: { created: true } });
            }}
          />
        ) : null
      }
    />
  );
}

export function ProjectsView({
  base,
  state,
  filter,
  onFilterChange,
  onRetry,
  onNew,
  form,
  copy = PERSONAL_OPERATIONS_COPY,
}: {
  base: string;
  state: ResourceState<ProjectListResponse>;
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  onRetry: () => void;
  onNew: () => void;
  form: ReactNode;
  copy?: OperationsCopy;
}) {
  const isFirstRun =
    state.status === 'success' && state.data.total === 0 && filter === 'all' && !form;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Trabajo"
          title={copy.projects.title}
          description={copy.projects.description}
        />
        {!form && !isFirstRun && (
          <Button className="mb-8 sm:mb-10" onClick={onNew}>
            <Icon name="plus" className="size-4" /> Nuevo proyecto
          </Button>
        )}
      </div>

      {form && <div className="mb-10">{form}</div>}

      {isFirstRun ? (
        <EmptyState
          title={copy.projects.emptyTitle}
          description={copy.projects.emptyDescription}
          action={
            <Button onClick={onNew}>
              <Icon name="plus" className="size-4" /> Nuevo proyecto
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-6">
            <Segmented
              label="Filtrar proyectos"
              options={PROJECT_FILTERS}
              value={filter}
              onChange={onFilterChange}
            />
          </div>
          {state.status === 'loading' && <LoadingBlock label="Cargando proyectos…" />}
          {state.status === 'error' && <ErrorState error={state.error} onRetry={onRetry} />}
          {state.status === 'success' &&
            (state.data.projects.length === 0 ? (
              <InlineEmpty>
                No hay proyectos{' '}
                {PROJECT_FILTERS.find((item) => item.id === filter)?.label.toLowerCase()}.
              </InlineEmpty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {state.data.projects.map((project) => (
                  <Reveal key={project.id}>
                    <ProjectCard project={project} to={`${base}/projects/${project.id}`} />
                  </Reveal>
                ))}
              </div>
            ))}
        </>
      )}
    </>
  );
}
