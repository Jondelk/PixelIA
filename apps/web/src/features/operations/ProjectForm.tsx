import type { CreateProjectInput } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { SelectField } from '../../components/SelectField';
import { apiFieldErrors, type FieldErrors } from '../../lib/forms';
import { errorMessage } from '../../lib/api';
import { TagInput } from '../onboarding/TagInput';
import { priorityOptions, projectStatusOptions } from './labels';
import { PERSONAL_OPERATIONS_COPY, type OperationsCopy } from './operationsCopy';
import { emptyProjectForm, projectFormToInput, type ProjectFormState } from './operationsForms';

/**
 * Crear o editar un proyecto. Solo el nombre es obligatorio; el resto se puede completar después.
 * `onSubmit` llama a la API; sus errores por campo (VALIDATION_ERROR) se muestran en el campo.
 * `copy` adapta los ejemplos y los tipos de proyecto al workspace (Personal o Enterprise).
 */
export function ProjectForm({
  initial = emptyProjectForm,
  submitLabel,
  onSubmit,
  onCancel,
  copy = PERSONAL_OPERATIONS_COPY.projectForm,
}: {
  initial?: ProjectFormState;
  submitLabel: string;
  onSubmit: (input: CreateProjectInput) => Promise<void>;
  onCancel: () => void;
  copy?: OperationsCopy['projectForm'];
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const set =
    <K extends keyof ProjectFormState>(key: K) =>
    (value: ProjectFormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = projectFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setSaving(true);
    try {
      await onSubmit(result.input);
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFailure(err);
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <TextField
        label="Nombre"
        value={form.name}
        onChange={(event) => set('name')(event.target.value)}
        error={errors.name}
        placeholder={copy.namePlaceholder}
        maxLength={120}
        autoFocus
        required
      />
      <TextAreaField
        label="Descripción"
        value={form.description}
        onChange={(event) => set('description')(event.target.value)}
        error={errors.description}
        placeholder={copy.descriptionPlaceholder}
        maxLength={2000}
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <SelectField
          label="Tipo"
          value={form.type}
          options={copy.typeOptions(initial.type)}
          onValueChange={(value) => value && set('type')(value)}
        />
        <SelectField
          label="Estado"
          value={form.status}
          options={projectStatusOptions}
          onValueChange={(value) => value && set('status')(value)}
        />
        <SelectField
          label="Prioridad"
          value={form.priority}
          options={priorityOptions}
          onValueChange={(value) => value && set('priority')(value)}
        />
      </div>
      <TagInput
        label="Objetivos"
        values={form.goals}
        onChange={set('goals')}
        error={errors.goals}
        max={10}
        placeholder="Escribe un objetivo y pulsa Enter"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Fecha de inicio"
          type="date"
          value={form.startDate}
          onChange={(event) => set('startDate')(event.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Fecha límite"
          type="date"
          value={form.dueDate}
          onChange={(event) => set('dueDate')(event.target.value)}
          error={errors.dueDate}
        />
      </div>
      {failure !== null && Object.keys(apiFieldErrors(failure)).length === 0 && (
        <Alert>{errorMessage(failure)}</Alert>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
