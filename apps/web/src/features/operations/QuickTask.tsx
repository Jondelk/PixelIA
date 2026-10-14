import type { Priority, Project, Task } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../../lib/api';
import { priorityOptions, projectOptions } from './labels';
import { quickTaskInput } from './operationsForms';
import { createTask } from './tasksApi';

/**
 * Crear una tarea en un gesto: escribe y pulsa Enter. Proyecto, prioridad y fecha son opcionales
 * y están a la vista (sin modal). Con `projectId` fijo (detalle de proyecto) no se muestra el
 * selector de proyecto.
 */
export function QuickTask({
  workspaceId,
  projects = [],
  projectId: fixedProjectId,
  defaultDueDate = '',
  onCreated,
}: {
  workspaceId: string;
  projects?: readonly Project[];
  projectId?: string;
  defaultDueDate?: string;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = quickTaskInput({
      title,
      projectId: fixedProjectId ?? projectId,
      priority,
      dueDate,
    });
    if (!result.ok) {
      setError(result.errors.title ?? 'Revisa la tarea');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const task = await createTask(workspaceId, result.input);
      setTitle('');
      onCreated(task);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={`quick-task-${fixedProjectId ?? 'all'}`} className="sr-only">
          Nueva tarea
        </label>
        <input
          id={`quick-task-${fixedProjectId ?? 'all'}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="¿Qué necesitas hacer?"
          maxLength={160}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-fg placeholder:text-subtle focus:outline-none"
        />
        <Button type="submit" loading={saving} disabled={!title.trim()} className="shrink-0">
          <Icon name="plus" className="size-4" /> Añadir
        </Button>
      </div>
      <div className="mt-2 grid gap-2 border-t border-line px-1 pt-3 sm:grid-cols-3">
        {!fixedProjectId && (
          <SelectField
            label="Proyecto"
            hideLabel
            value={projectId}
            placeholder="Sin proyecto"
            options={projectOptions(projects)}
            onValueChange={setProjectId}
          />
        )}
        <SelectField
          label="Prioridad"
          hideLabel
          value={priority}
          options={priorityOptions.map((option) => ({
            ...option,
            label: `Prioridad ${option.label.toLowerCase()}`,
          }))}
          onValueChange={(value) => value && setPriority(value)}
        />
        <div>
          <label htmlFor={`quick-task-date-${fixedProjectId ?? 'all'}`} className="sr-only">
            Fecha
          </label>
          <input
            id={`quick-task-date-${fixedProjectId ?? 'all'}`}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-fg focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
          />
        </div>
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-2 px-3 text-xs text-fg" role="alert">
          <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  );
}
