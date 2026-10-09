import { OPEN_TASK_STATUSES, type Task, type TaskStatus } from '@pixel/contracts';
import type { TaskFilters } from './tasksApi';

/*
 * Vistas de /workspace/:workspaceId/tasks. Cada una es solo un filtro de la API: no hay
 * planificación ni priorización automática.
 */

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'all' | 'done';

export interface TaskViewDefinition {
  id: TaskView;
  label: string;
  empty: string;
}

export const TASK_VIEWS: readonly TaskViewDefinition[] = [
  { id: 'inbox', label: 'Inbox', empty: 'Tu inbox está vacío.' },
  { id: 'today', label: 'Hoy', empty: 'Nada vence hoy.' },
  { id: 'upcoming', label: 'Próximas', empty: 'No tienes tareas con fecha próxima.' },
  { id: 'all', label: 'Todas', empty: 'No tienes tareas pendientes.' },
  { id: 'done', label: 'Completadas', empty: 'Aún no has completado ninguna tarea.' },
];

export const DEFAULT_TASK_VIEW: TaskView = 'all';

export function isTaskView(value: string | null): value is TaskView {
  return TASK_VIEWS.some((view) => view.id === value);
}

/** Filtros de la API de cada vista. "Hoy" pide aparte las vencidas (ver `overdueFilters`). */
export function taskViewFilters(view: TaskView): TaskFilters {
  switch (view) {
    case 'inbox':
      return { status: ['inbox'] };
    case 'today':
      return { status: OPEN_TASK_STATUSES, due: 'today' };
    case 'upcoming':
      return { status: OPEN_TASK_STATUSES, due: 'upcoming' };
    case 'done':
      return { status: ['done'] };
    case 'all':
      return { status: OPEN_TASK_STATUSES };
  }
}

/** Pendientes que vencieron antes de hoy (se muestran arriba en "Hoy"). */
export const overdueFilters: TaskFilters = { status: OPEN_TASK_STATUSES, due: 'overdue' };

export function isTaskDone(status: TaskStatus): boolean {
  return status === 'done';
}

/** Estado al pulsar el checkbox: completar o reabrir (a "Por hacer"). */
export function toggledStatus(status: TaskStatus): TaskStatus {
  return isTaskDone(status) ? 'todo' : 'done';
}

/** Aplica estados optimistas (pendientes de confirmar por la API) sobre una lista. */
export function withOptimisticStatus(
  tasks: readonly Task[],
  overrides: Readonly<Record<string, TaskStatus>>,
): Task[] {
  return tasks.map((task) => {
    const status = overrides[task.id];
    return status && status !== task.status ? { ...task, status } : task;
  });
}
