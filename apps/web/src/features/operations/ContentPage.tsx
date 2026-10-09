import {
  CONTENT_STATUS_LABELS,
  type ContentItemListResponse,
  type Project,
} from '@pixel/contracts';
import { useCallback, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { useResource, type ResourceState } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { ContentForm } from './ContentForm';
import { ContentList, type ContentListActions } from './ContentList';
import { contentListActions } from './contentActions';
import { createContentItem, listContent } from './contentApi';
import {
  contentTabOptions,
  countByStatus,
  DEFAULT_CONTENT_TAB,
  isContentTab,
  itemsInStage,
  type ContentTab,
} from './contentPipeline';
import { operationsCopy, PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import { emptyContentForm } from './operationsForms';
import { Flash, InlineEmpty, LoadingBlock, Segmented } from './ui';
import { useFlash } from './useFlash';
import { useWorkspaceProjects } from './useProjects';

/** /workspace/:workspaceId/content — pipeline Ideas → Publicado (sin calendario ni redes). */
export function ContentPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('stage');
  const stage: ContentTab = isContentTab(raw) ? raw : DEFAULT_CONTENT_TAB;
  const [creating, setCreating] = useState(false);
  const { flash, show, dismiss } = useFlash();
  const projects = useWorkspaceProjects(workspaceId);
  const copy = operationsCopy(overview);

  const pipeline = useResource(`content:${workspaceId}`, (signal) =>
    listContent(workspaceId, { limit: 100 }, signal),
  );
  const archived = useResource(`content:${workspaceId}:archived:${stage}`, (signal) =>
    stage === 'archived'
      ? listContent(workspaceId, { status: ['archived'], limit: 100 }, signal)
      : Promise.resolve<ContentItemListResponse>({ contentItems: [], total: 0 }),
  );
  const reloadPipeline = pipeline.reload;
  const reloadArchived = archived.reload;
  const onChanged = useCallback(() => {
    reloadPipeline();
    reloadArchived();
  }, [reloadPipeline, reloadArchived]);

  return (
    <ContentView
      copy={copy}
      stage={stage}
      onStageChange={(next) => {
        setCreating(false);
        setSearchParams(next === DEFAULT_CONTENT_TAB ? {} : { stage: next }, { replace: true });
      }}
      pipeline={pipeline.state}
      archived={archived.state}
      projects={projects.all}
      onRetry={onChanged}
      flash={<Flash message={flash?.message ?? null} action={flash?.action} onDismiss={dismiss} />}
      creating={creating}
      onNew={() => setCreating(true)}
      form={
        <ContentForm
          titlePlaceholder={copy.content.titlePlaceholder}
          key={stage}
          initial={{ ...emptyContentForm, status: stage }}
          projects={projects.assignable}
          submitLabel="Crear contenido"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const item = await createContentItem(workspaceId, input);
            setCreating(false);
            onChanged();
            show(`Contenido creado: ${item.title}`);
          }}
        />
      }
      actions={contentListActions(workspaceId, { onChanged, notify: show })}
    />
  );
}

export function ContentView({
  stage,
  onStageChange,
  pipeline,
  archived,
  projects,
  onRetry,
  flash,
  creating,
  onNew,
  form,
  actions,
  copy = PERSONAL_OPERATIONS_COPY,
}: {
  stage: ContentTab;
  onStageChange: (stage: ContentTab) => void;
  pipeline: ResourceState<ContentItemListResponse>;
  archived: ResourceState<ContentItemListResponse>;
  projects: readonly Project[];
  onRetry: () => void;
  flash?: ReactNode;
  creating: boolean;
  onNew: () => void;
  form: ReactNode;
  actions: ContentListActions;
  copy?: OperationsCopy;
}) {
  const items = pipeline.status === 'success' ? pipeline.data.contentItems : [];
  const counts = pipeline.status === 'success' ? countByStatus(items) : null;
  const isEmpty =
    pipeline.status === 'success' && pipeline.data.total === 0 && stage !== 'archived' && !creating;
  const source = stage === 'archived' ? archived : pipeline;
  const stageItems =
    stage === 'archived'
      ? archived.status === 'success'
        ? archived.data.contentItems
        : []
      : itemsInStage(items, stage);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Trabajo" title="Contenido" description={copy.content.description} />
        {!creating && !isEmpty && (
          <Button className="mb-8 sm:mb-10" onClick={onNew}>
            <Icon name="plus" className="size-4" /> Nuevo contenido
          </Button>
        )}
      </div>
      {flash}
      {creating && <div className="mb-10">{form}</div>}

      {isEmpty ? (
        <EmptyState
          title={copy.content.emptyTitle}
          description="Anota una idea con solo un título; el concepto, el hook y el guion pueden llegar después."
          action={
            <Button onClick={onNew}>
              <Icon name="plus" className="size-4" /> Nueva idea
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-6">
            <Segmented
              label="Etapa del contenido"
              options={contentTabOptions(counts)}
              value={stage}
              onChange={onStageChange}
            />
          </div>
          {source.status === 'loading' && <LoadingBlock label="Cargando contenido…" />}
          {source.status === 'error' && <ErrorState error={source.error} onRetry={onRetry} />}
          {source.status === 'success' &&
            (stageItems.length === 0 ? (
              <InlineEmpty>
                {stage === 'idea'
                  ? copy.content.emptyTitle
                  : `Nada en ${CONTENT_STATUS_LABELS[stage].toLowerCase()} por ahora.`}
              </InlineEmpty>
            ) : (
              <ContentList items={stageItems} projects={projects} actions={actions} />
            ))}
          {pipeline.status === 'success' && pipeline.data.total > items.length && (
            <p className="mt-4 text-xs text-subtle">
              Mostrando {items.length} de {pipeline.data.total} piezas.
            </p>
          )}
        </>
      )}
    </>
  );
}
