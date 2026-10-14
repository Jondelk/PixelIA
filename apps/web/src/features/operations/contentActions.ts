import { CONTENT_STATUS_LABELS } from '@pixel/contracts';
import type { ContentListActions } from './ContentList';
import { deleteContentItem, updateContentItem } from './contentApi';
import type { FlashMessage } from './useFlash';

/** Acciones estándar de una ContentList contra la API, con aviso de éxito y recarga. */
export function contentListActions(
  workspaceId: string,
  { onChanged, notify }: { onChanged: () => void; notify: (flash: FlashMessage) => void },
): ContentListActions {
  return {
    onMove: async (item, status) => {
      await updateContentItem(workspaceId, item.id, { status });
      onChanged();
      notify({
        message:
          status === 'published'
            ? `Publicado: ${item.title}`
            : `${item.title} → ${CONTENT_STATUS_LABELS[status]}`,
        action: {
          label: 'Deshacer',
          onClick: () =>
            void updateContentItem(workspaceId, item.id, { status: item.status }).then(onChanged),
        },
      });
    },
    onSave: async (item, input) => {
      await updateContentItem(workspaceId, item.id, input);
      onChanged();
      notify({ message: 'Contenido guardado' });
    },
    onDelete: async (item) => {
      await deleteContentItem(workspaceId, item.id);
      onChanged();
      notify({ message: 'Contenido eliminado' });
    },
  };
}
