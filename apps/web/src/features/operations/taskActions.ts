import { updateTask, deleteTask } from './tasksApi';
import { taskFormToInput } from './operationsForms';
import type { TaskListActions } from './TaskList';
import { toggledStatus } from './taskViews';
import type { FlashMessage } from './useFlash';

/** Acciones estándar de una TaskList contra la API, con aviso de éxito y recarga. */
export function taskListActions(
  workspaceId: string,
  {
    onChanged,
    notify,
  }: {
    onChanged: () => void;
    notify: (flash: FlashMessage) => void;
  },
): TaskListActions {
  return {
    onToggle: async (task) => {
      const status = toggledStatus(task.status);
      await updateTask(workspaceId, task.id, { status });
      onChanged();
      notify(
        status === 'done'
          ? {
              message: `Completada: ${task.title}`,
              action: {
                label: 'Deshacer',
                onClick: () =>
                  void updateTask(workspaceId, task.id, { status: task.status }).then(onChanged),
              },
            }
          : { message: `Reabierta: ${task.title}` },
      );
    },
    onSave: async (task, form) => {
      const result = taskFormToInput(form);
      if (!result.ok) return;
      await updateTask(workspaceId, task.id, result.input);
      onChanged();
      notify({ message: 'Tarea guardada' });
    },
    onDelete: async (task) => {
      await deleteTask(workspaceId, task.id);
      onChanged();
      notify({ message: 'Tarea eliminada' });
    },
  };
}
