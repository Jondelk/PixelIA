import {
  CONTENT_ANGLE_LABELS,
  CONTENT_PLAN_ITEM_STATUS_LABELS,
  type ContentPlanItem,
  type UpdateContentPlanItemInput,
} from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../../lib/api';
import { dateInputToIso } from '../operations/dates';
import { formatOptions, platformFormatLabel, platformOptions } from '../operations/labels';
import { DueLabel, StatusTag } from '../operations/ui';
import { itemEditForm, type ItemEditForm } from './plannerLogic';

export interface PlanItemActions {
  onAccept: (item: ContentPlanItem) => Promise<void>;
  onReject: (item: ContentPlanItem, reason: string) => Promise<void>;
  onRestore: (item: ContentPlanItem) => Promise<void>;
  onSave: (item: ContentPlanItem, input: UpdateContentPlanItemInput) => Promise<void>;
}

type Mode = 'view' | 'edit' | 'reject';

/**
 * Una propuesta de Pixel: qué, dónde, cuándo y, sobre todo, por qué. Aceptar la convierte en un
 * ContentItem ("Añadido a Contenido"); la propuesta sigue en el plan como "Convertido".
 */
export function PlanItemCard({
  item,
  projectName,
  contentHref,
  actions,
}: {
  item: ContentPlanItem;
  projectName: string | null;
  contentHref: string;
  actions: PlanItemActions;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState<'accept' | 'reject' | 'restore' | 'save' | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const converted = item.status === 'converted';
  const rejected = item.status === 'rejected';

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
      setMode('view');
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(null);
    }
  };

  const meta = platformFormatLabel(item);

  return (
    <article
      aria-label={item.title}
      className={[
        'rounded-2xl border bg-surface p-6 transition-colors sm:p-7',
        converted ? 'border-line-strong' : 'border-line',
        rejected ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag>{CONTENT_PLAN_ITEM_STATUS_LABELS[item.status]}</StatusTag>
        {meta && <span className="text-xs text-subtle">{meta}</span>}
        <span className="flex-1" />
        <DueLabel iso={item.scheduledFor} pending={false} prefix="Sugerida" />
      </div>

      {mode === 'edit' ? (
        <ItemEditor
          item={item}
          busy={busy === 'save'}
          onCancel={() => setMode('view')}
          onSave={(input) => void run('save', () => actions.onSave(item, input))}
        />
      ) : (
        <>
          <h3 className="mt-4 font-display text-lg font-bold leading-snug tracking-tight">
            {item.title}
          </h3>
          {item.concept && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.concept}</p>
          )}
          {item.hook && (
            <p className="mt-4 border-l-2 border-line-strong pl-4 text-[15px] text-fg">
              «{item.hook}»
            </p>
          )}

          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {item.objective && <Meta label="Objetivo">{item.objective}</Meta>}
            {item.pillar && <Meta label="Pilar">{item.pillar}</Meta>}
            {item.angle && <Meta label="Ángulo">{CONTENT_ANGLE_LABELS[item.angle]}</Meta>}
            {projectName && <Meta label="Proyecto">{projectName}</Meta>}
          </dl>

          {item.rationale && (
            <div className="mt-5 rounded-xl bg-elevated px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
                Por qué Pixel lo recomienda
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-fg">{item.rationale}</p>
            </div>
          )}
          {rejected && item.rejectionReason && (
            <p className="mt-3 text-xs text-subtle">Motivo: {item.rejectionReason}</p>
          )}
        </>
      )}

      {failure !== null && (
        <div className="mt-4">
          <Alert>{errorMessage(failure)}</Alert>
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField
              label="Motivo (opcional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder="No encaja con mi tono, ya lo hice…"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={busy === 'reject'}
              onClick={() => void run('reject', () => actions.onReject(item, reason.trim()))}
            >
              Rechazar
            </Button>
            <Button variant="ghost" onClick={() => setMode('view')} disabled={busy !== null}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {mode === 'view' && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {converted ? (
            <>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-fg">
                <Icon name="check" className="size-4" /> Añadido a Contenido
              </span>
              <Link to={contentHref} className="ml-2 text-sm text-muted underline hover:text-fg">
                Ver en Contenido
              </Link>
            </>
          ) : (
            <>
              <Button
                loading={busy === 'accept'}
                disabled={busy !== null}
                onClick={() => void run('accept', () => actions.onAccept(item))}
              >
                <Icon name="check" className="size-4" /> Aceptar
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => setMode('edit')}>
                <Icon name="pencil" className="size-4" /> Editar
              </Button>
              {rejected ? (
                <Button
                  variant="ghost"
                  loading={busy === 'restore'}
                  disabled={busy !== null}
                  onClick={() => void run('restore', () => actions.onRestore(item))}
                >
                  Recuperar
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy !== null} onClick={() => setMode('reject')}>
                  <Icon name="x" className="size-4" /> Rechazar
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Meta({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{label}</dt>
      <dd className="mt-1 text-fg">{children}</dd>
    </div>
  );
}

function ItemEditor({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item: ContentPlanItem;
  busy: boolean;
  onSave: (input: UpdateContentPlanItemInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ItemEditForm>(() => itemEditForm(item));
  const [error, setError] = useState<string | null>(null);
  const set =
    <K extends keyof ItemEditForm>(key: K) =>
    (value: ItemEditForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Escribe un título');
      return;
    }
    setError(null);
    onSave({
      title: form.title,
      concept: form.concept,
      hook: form.hook,
      platform: form.platform || null,
      format: form.format || null,
      scheduledFor: dateInputToIso(form.scheduledFor),
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Editar propuesta" className="mt-5 space-y-4">
      <TextField
        label="Título"
        value={form.title}
        onChange={(event) => set('title')(event.target.value)}
        error={error ?? undefined}
        maxLength={160}
        autoFocus
      />
      <TextAreaField
        label="Concepto"
        value={form.concept}
        onChange={(event) => set('concept')(event.target.value)}
        maxLength={2000}
      />
      <TextField
        label="Hook"
        value={form.hook}
        onChange={(event) => set('hook')(event.target.value)}
        maxLength={500}
      />
      <div className="grid gap-4 sm:grid-cols-3">
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
        <TextField
          label="Fecha"
          type="date"
          value={form.scheduledFor}
          onChange={(event) => set('scheduledFor')(event.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" loading={busy}>
          Guardar cambios
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
