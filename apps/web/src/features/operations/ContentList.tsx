import {
  CONTENT_STATUS_LABELS,
  type ContentItem,
  type ContentStatus,
  type CreateContentItemInput,
  type Project,
} from '@pixel/contracts';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { ContentForm } from './ContentForm';
import { nextContentStatus, platformFormatLabel } from './labels';
import { contentToForm } from './operationsForms';
import { DueLabel, StatusTag } from './ui';

export interface ContentListActions {
  onMove: (item: ContentItem, status: ContentStatus) => Promise<void>;
  onSave: (item: ContentItem, input: CreateContentItemInput) => Promise<void>;
  onDelete: (item: ContentItem) => Promise<void>;
}

/**
 * Piezas de contenido como tarjetas. Avanzar de etapa es un botón ("Pasar a Revisión"); el resto
 * se edita en línea. Sin drag-and-drop.
 */
export function ContentList({
  items,
  projects,
  showStatus = false,
  showProject = true,
  fixedProjectId,
  actions,
}: {
  items: readonly ContentItem[];
  projects: readonly Project[];
  showStatus?: boolean;
  showProject?: boolean;
  fixedProjectId?: string;
  actions: ContentListActions;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<unknown>(null);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  const move = async (item: ContentItem, status: ContentStatus) => {
    setMoving(item.id);
    setMoveError(null);
    try {
      await actions.onMove(item, status);
    } catch (err) {
      setMoveError(err);
    } finally {
      setMoving(null);
    }
  };

  return (
    <div>
      {moveError !== null && (
        <div className="mb-3">
          <Alert>No se pudo mover la pieza. {errorMessage(moveError)}</Alert>
        </div>
      )}
      <ul className="grid gap-3">
        {items.map((item) => {
          if (editing === item.id) {
            return (
              <li key={item.id}>
                <ContentForm
                  initial={contentToForm(item)}
                  projects={projects}
                  fixedProjectId={fixedProjectId}
                  submitLabel="Guardar"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await actions.onSave(item, input);
                    setEditing(null);
                  }}
                  onDelete={async () => {
                    await actions.onDelete(item);
                    setEditing(null);
                  }}
                />
              </li>
            );
          }
          const next = nextContentStatus(item.status);
          const meta = platformFormatLabel(item);
          const projectName =
            showProject && item.projectId ? projectNames.get(item.projectId) : undefined;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6"
            >
              <button
                type="button"
                onClick={() => setEditing(item.id)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Editar: ${item.title}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  {showStatus && <StatusTag>{CONTENT_STATUS_LABELS[item.status]}</StatusTag>}
                  {meta && <span className="text-xs text-subtle">{meta}</span>}
                  {item.source === 'pixel' && (
                    <span className="text-xs text-subtle">· Propuesto por Pixel</span>
                  )}
                </span>
                <span className="mt-1.5 block font-display text-[15px] font-bold leading-snug text-fg">
                  {item.title}
                </span>
                {(item.hook || item.concept) && (
                  <span className="mt-1.5 line-clamp-2 block text-sm text-muted">
                    {item.hook ?? item.concept}
                  </span>
                )}
                <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {item.status === 'published' && item.publishedAt ? (
                    <DueLabel iso={item.publishedAt} pending={false} prefix="Publicado" />
                  ) : (
                    <DueLabel
                      iso={item.scheduledFor}
                      pending={item.status !== 'archived'}
                      prefix="Prevista"
                    />
                  )}
                  {projectName && <span className="text-xs text-subtle">{projectName}</span>}
                </span>
              </button>
              {next && (
                <Button
                  variant="secondary"
                  className="shrink-0 self-start sm:self-center"
                  loading={moving === item.id}
                  disabled={moving !== null}
                  onClick={() => void move(item, next)}
                >
                  {next === 'published'
                    ? 'Marcar publicado'
                    : `Pasar a ${CONTENT_STATUS_LABELS[next]}`}
                  <Icon name="arrowRight" className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
