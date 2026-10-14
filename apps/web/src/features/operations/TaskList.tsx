import type { Project, Task, TaskStatus } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, type FieldErrors } from '../../lib/forms';
import { priorityOptions, projectOptions, taskStatusOptions } from './labels';
import { taskFormToInput, taskToForm, type TaskFormState } from './operationsForms';

import { isTaskDone, toggledStatus, withOptimisticStatus } from './taskViews';
import { DueLabel, PriorityMark } from './ui';

export interface TaskListActions {
  /** Completa o reabre. Debe resolver cuando la API confirma. */
  onToggle: (task: Task) => Promise<void>;
  onSave: (task: Task, form: TaskFormState) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}

/**
 * Lista de tareas: checkbox, título, proyecto, prioridad y fecha. Al pulsar una tarea se edita en
 * línea (sin modal). Completar es optimista: la casilla cambia al instante y vuelve atrás si la
 * API falla.
 */
export function TaskList({
  tasks,
  projects,
  showProject = true,
  actions,
}: {
  tasks: readonly Task[];
  projects: readonly Project[];
  showProject?: boolean;
  actions: TaskListActions;
}) {
  // Estado optimista por tarea: se mantiene hasta que la lista recargada lo confirma (o se edita).
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<unknown>(null);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const forget = (taskId: string) => setOverrides(({ [taskId]: _gone, ...rest }) => rest);

  const toggle = async (task: Task) => {
    setToggleError(null);
    setOverrides((current) => ({ ...current, [task.id]: toggledStatus(task.status) }));
    setPending((current) => new Set(current).add(task.id));
    try {
      await actions.onToggle(task);
    } catch (err) {
      forget(task.id);
      setToggleError(err);
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  return (
    <div>
      {toggleError !== null && (
        <div className="mb-3">
          <Alert>No se pudo actualizar la tarea. {errorMessage(toggleError)}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {withOptimisticStatus(tasks, overrides).map((task) =>
          editing === task.id ? (
            <li key={task.id} className="p-5 sm:p-6">
              <TaskEditor
                task={task}
                projects={projects}
                onCancel={() => setEditing(null)}
                onSave={async (form) => {
                  await actions.onSave(task, form);
                  forget(task.id);
                  setEditing(null);
                }}
                onDelete={async () => {
                  await actions.onDelete(task);
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <TaskRow
              key={task.id}
              task={task}
              projectName={
                showProject && task.projectId ? (projectNames.get(task.projectId) ?? null) : null
              }
              pending={pending.has(task.id)}
              onToggle={() => void toggle(task)}
              onEdit={() => setEditing(task.id)}
            />
          ),
        )}
      </ul>
    </div>
  );
}

function TaskRow({
  task,
  projectName,
  pending,
  onToggle,
  onEdit,
}: {
  task: Task;
  projectName: string | null;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const done = isTaskDone(task.status);
  return (
    <li className="group flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir: ${task.title}` : `Completar: ${task.title}`}
        onClick={onToggle}
        disabled={pending}
        className={[
          'grid size-5 shrink-0 place-items-center rounded-sm border transition-colors',
          done
            ? 'border-brand bg-brand text-on-brand'
            : 'border-line-strong text-transparent hover:border-fg',
        ].join(' ')}
      >
        <Icon name="check" className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Editar: ${task.title}`}
      >
        <span
          className={[
            'block truncate text-[15px] transition-colors',
            done ? 'text-subtle line-through' : 'text-fg group-hover:text-fg',
          ].join(' ')}
        >
          {task.title}
        </span>
        {(projectName || task.status === 'cancelled') && (
          <span className="mt-0.5 block truncate text-xs text-subtle">
            {task.status === 'cancelled' ? 'Cancelada' : projectName}
            {task.status === 'cancelled' && projectName ? ` · ${projectName}` : ''}
          </span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-4">
        <DueLabel iso={task.dueDate} pending={!done && task.status !== 'cancelled'} />
        <PriorityMark priority={task.priority} compact />
      </div>
    </li>
  );
}

function TaskEditor({
  task,
  projects,
  onSave,
  onCancel,
  onDelete,
}: {
  task: Task;
  projects: readonly Project[];
  onSave: (form: TaskFormState) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => taskToForm(task));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set =
    <K extends keyof TaskFormState>(key: K) =>
    (value: TaskFormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const run = async (kind: 'save' | 'delete', action: () => Promise<void>) => {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFailure(err);
      setBusy(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = taskFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void run('save', () => onSave(form));
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Editar tarea">
      <TextField
        label="Tarea"
        value={form.title}
        onChange={(event) => set('title')(event.target.value)}
        error={errors.title}
        maxLength={160}
        autoFocus
      />
      <TextAreaField
        label="Notas"
        value={form.description}
        onChange={(event) => set('description')(event.target.value)}
        error={errors.description}
        maxLength={4000}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          label="Proyecto"
          value={form.projectId}
          placeholder="Sin proyecto"
          options={projectOptions(projects)}
          onValueChange={set('projectId')}
          error={errors.projectId}
          className="lg:col-span-2"
        />
        <SelectField
          label="Estado"
          value={form.status}
          options={taskStatusOptions}
          onValueChange={(value) => value && set('status')(value)}
        />
        <SelectField
          label="Prioridad"
          value={form.priority}
          options={priorityOptions}
          onValueChange={(value) => value && set('priority')(value)}
        />
        <TextField
          label="Fecha"
          type="date"
          value={form.dueDate}
          onChange={(event) => set('dueDate')(event.target.value)}
          error={errors.dueDate}
        />
      </div>
      <div className="sm:w-1/3">
        <TextField
          label="Estimación (minutos)"
          type="number"
          inputMode="numeric"
          min={1}
          value={form.estimatedMinutes}
          onChange={(event) => set('estimatedMinutes')(event.target.value)}
          error={errors.estimatedMinutes}
        />
      </div>
      {failure !== null && Object.keys(apiFieldErrors(failure)).length === 0 && (
        <Alert>{errorMessage(failure)}</Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy === 'save'} disabled={busy !== null}>
          Guardar
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
          Cancelar
        </Button>
        <span className="flex-1" />
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            ¿Eliminar la tarea?
            <Button
              variant="secondary"
              loading={busy === 'delete'}
              disabled={busy !== null}
              onClick={() => void run('delete', onDelete)}
            >
              Eliminar
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={busy !== null}
            >
              No
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            <Icon name="trash" className="size-4" /> Eliminar
          </Button>
        )}
      </div>
    </form>
  );
}
