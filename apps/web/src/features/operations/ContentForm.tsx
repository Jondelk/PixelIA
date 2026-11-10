import type { CreateContentItemInput, Project } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, type FieldErrors } from '../../lib/forms';
import { contentStatusOptions, formatOptions, platformOptions, projectOptions } from './labels';
import { contentFormToInput, emptyContentForm, type ContentFormState } from './operationsForms';

/**
 * Crear o editar una pieza de contenido. Solo el título es obligatorio; el desarrollo creativo
 * (hook, caption, guion, notas) queda plegado hasta que se necesite.
 */
export function ContentForm({
  initial = emptyContentForm,
  projects,
  fixedProjectId,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  titlePlaceholder = 'Cómo construí Pixel Personal',
}: {
  initial?: ContentFormState;
  projects: readonly Project[];
  /** Detalle de proyecto: la pieza queda en ese proyecto y no se muestra el selector. */
  fixedProjectId?: string;
  submitLabel: string;
  onSubmit: (input: CreateContentItemInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  /** Ejemplo del título según el workspace (operationsCopy). */
  titlePlaceholder?: string;
}) {
  const [form, setForm] = useState<ContentFormState>(() =>
    fixedProjectId ? { ...initial, projectId: fixedProjectId } : initial,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasCreative = Boolean(initial.hook || initial.caption || initial.script || initial.notes);
  const [showCreative, setShowCreative] = useState(hasCreative);
  const set =
    <K extends keyof ContentFormState>(key: K) =>
    (value: ContentFormState[K]) =>
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
    const result = contentFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void run('save', () => onSubmit(result.input));
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={onDelete ? 'Editar contenido' : 'Nuevo contenido'}
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <TextField
        label="Título"
        value={form.title}
        onChange={(event) => set('title')(event.target.value)}
        error={errors.title}
        placeholder={titlePlaceholder}
        maxLength={160}
        autoFocus
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextAreaField
          label="Concepto"
          value={form.concept}
          onChange={(event) => set('concept')(event.target.value)}
          error={errors.concept}
          placeholder="La idea en una o dos frases"
          maxLength={2000}
        />
        <TextAreaField
          label="Objetivo"
          value={form.objective}
          onChange={(event) => set('objective')(event.target.value)}
          error={errors.objective}
          placeholder="¿Qué debe conseguir esta pieza?"
          maxLength={500}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Plataforma"
          value={form.platform}
          placeholder="Sin definir"
          options={platformOptions}
          onValueChange={set('platform')}
        />
        <SelectField
          label="Formato"
          value={form.format}
          placeholder="Sin definir"
          options={formatOptions}
          onValueChange={set('format')}
        />
        <SelectField
          label="Etapa"
          value={form.status}
          options={contentStatusOptions}
          onValueChange={(value) => value && set('status')(value)}
        />
        <TextField
          label="Fecha prevista"
          type="date"
          value={form.scheduledFor}
          onChange={(event) => set('scheduledFor')(event.target.value)}
          error={errors.scheduledFor}
        />
      </div>
      {!fixedProjectId && (
        <div className="sm:w-1/2">
          <SelectField
            label="Proyecto"
            value={form.projectId}
            placeholder="Sin proyecto"
            options={projectOptions(projects)}
            onValueChange={set('projectId')}
            error={errors.projectId}
          />
        </div>
      )}

      {showCreative ? (
        <div className="space-y-5 border-t border-line pt-5">
          <TextField
            label="Hook"
            value={form.hook}
            onChange={(event) => set('hook')(event.target.value)}
            error={errors.hook}
            placeholder="La primera frase que detiene el scroll"
            maxLength={500}
          />
          <TextAreaField
            label="Caption"
            value={form.caption}
            onChange={(event) => set('caption')(event.target.value)}
            error={errors.caption}
            maxLength={5000}
          />
          <TextAreaField
            label="Guion"
            value={form.script}
            onChange={(event) => set('script')(event.target.value)}
            error={errors.script}
            maxLength={20_000}
          />
          <TextAreaField
            label="Notas"
            value={form.notes}
            onChange={(event) => set('notes')(event.target.value)}
            error={errors.notes}
            maxLength={5000}
          />
        </div>
      ) : (
        <Button variant="ghost" className="!px-0" onClick={() => setShowCreative(true)}>
          <Icon name="plus" className="size-4" /> Hook, caption, guion y notas
        </Button>
      )}

      {failure !== null && Object.keys(apiFieldErrors(failure)).length === 0 && (
        <Alert>{errorMessage(failure)}</Alert>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" loading={busy === 'save'} disabled={busy !== null}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
          Cancelar
        </Button>
        <span className="flex-1" />
        {onDelete &&
          (confirmDelete ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              ¿Eliminar la pieza?
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
          ))}
      </div>
    </form>
  );
}
