import {
  CAMPAIGN_DELIVERABLE_STATUS_LABELS,
  CAMPAIGN_DELIVERABLE_TYPE_LABELS,
  deliverableTarget,
  type CampaignDeliverable,
  type CampaignDeliverableType,
  type UpdateCampaignDeliverableInput,
} from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import { errorMessage } from '../../lib/api';
import { labelOptions } from '../operations/labels';
import { StatusTag } from '../operations/ui';

const typeOptions = labelOptions(CAMPAIGN_DELIVERABLE_TYPE_LABELS);

export interface DeliverableActions {
  onAccept: (deliverable: CampaignDeliverable) => Promise<void>;
  onReject: (deliverable: CampaignDeliverable) => Promise<void>;
  onSave: (
    deliverable: CampaignDeliverable,
    input: UpdateCampaignDeliverableInput,
  ) => Promise<void>;
}

/**
 * Una pieza que la campaña necesita: qué, dónde, para qué y por qué. Aceptar la convierte en
 * trabajo real (Contenido o un Proyecto, según su tipo); rechazar la deja a un lado sin borrarla.
 * No es una aprobación formal: eso llegará con el flujo creativo.
 */
export function DeliverableCard({
  deliverable,
  base,
  actions,
}: {
  deliverable: CampaignDeliverable;
  base: string;
  actions: DeliverableActions;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'reject' | 'save' | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [form, setForm] = useState(() => toForm(deliverable));
  const converted = deliverable.status === 'converted';
  const rejected = deliverable.status === 'rejected';
  const target = deliverableTarget(deliverable.type);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
      setEditing(false);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(null);
    }
  };

  const meta = [
    CAMPAIGN_DELIVERABLE_TYPE_LABELS[deliverable.type],
    deliverable.platform,
    deliverable.format,
  ]
    .filter(Boolean)
    .join(' · ');
  const href = deliverable.convertedContentItemId
    ? `${base}/content`
    : deliverable.convertedProjectId
      ? `${base}/projects/${deliverable.convertedProjectId}`
      : null;

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run('save', () =>
      actions.onSave(deliverable, {
        title: form.title,
        description: form.description,
        type: form.type,
        platform: form.platform,
        format: form.format,
        objective: form.objective,
      }),
    );
  };

  return (
    <article
      aria-label={deliverable.title}
      className={[
        'rounded-2xl border bg-surface p-6 sm:p-7',
        converted ? 'border-line-strong' : 'border-line',
        rejected ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag>{CAMPAIGN_DELIVERABLE_STATUS_LABELS[deliverable.status]}</StatusTag>
        <span className="text-xs text-subtle">{meta}</span>
      </div>

      {editing ? (
        <form onSubmit={save} noValidate className="mt-5 space-y-4">
          <TextField
            label="Título"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            maxLength={160}
            required
          />
          <TextAreaField
            label="Descripción"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            maxLength={600}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField<CampaignDeliverableType>
              label="Tipo"
              value={form.type}
              options={typeOptions}
              onValueChange={(value) => value && setForm({ ...form, type: value })}
            />
            <TextField
              label="Canal"
              value={form.platform}
              onChange={(event) => setForm({ ...form, platform: event.target.value })}
              maxLength={60}
            />
            <TextField
              label="Formato"
              value={form.format}
              onChange={(event) => setForm({ ...form, format: event.target.value })}
              maxLength={60}
            />
          </div>
          <TextField
            label="Objetivo"
            value={form.objective}
            onChange={(event) => setForm({ ...form, objective: event.target.value })}
            maxLength={300}
          />
          {failure !== null && <Alert>{errorMessage(failure)}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy === 'save'}>
              Guardar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(toForm(deliverable));
                setEditing(false);
              }}
              disabled={busy !== null}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h3 className="mt-4 font-display text-base font-bold leading-snug">
            {deliverable.title}
          </h3>
          {deliverable.description && (
            <p className="mt-2 text-sm text-muted">{deliverable.description}</p>
          )}
          {deliverable.objective && (
            <p className="mt-4 text-sm">
              <span className="text-subtle">Objetivo: </span>
              <span className="text-fg">{deliverable.objective}</span>
            </p>
          )}
          {deliverable.rationale && (
            <p className="mt-2 text-sm">
              <span className="text-subtle">¿Por qué? </span>
              <span className="text-muted">{deliverable.rationale}</span>
            </p>
          )}
          {failure !== null && (
            <div className="mt-4">
              <Alert>{errorMessage(failure)}</Alert>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {converted && href ? (
              <Link to={href} className="inline-flex items-center gap-2 text-sm text-fg underline">
                {deliverable.convertedContentItemId ? 'Ver en Contenido' : 'Ver el proyecto'}
                <Icon name="arrowRight" className="size-4" />
              </Link>
            ) : (
              <>
                <Button
                  onClick={() => void run('accept', () => actions.onAccept(deliverable))}
                  loading={busy === 'accept'}
                  disabled={busy !== null}
                >
                  <Icon name="check" className="size-4" /> Aceptar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setEditing(true)}
                  disabled={busy !== null}
                >
                  <Icon name="pencil" className="size-4" /> Editar
                </Button>
                {!rejected && (
                  <Button
                    variant="ghost"
                    onClick={() => void run('reject', () => actions.onReject(deliverable))}
                    loading={busy === 'reject'}
                    disabled={busy !== null}
                  >
                    Rechazar
                  </Button>
                )}
                <span className="text-xs text-subtle">
                  {target === 'content_item' ? 'Se creará en Contenido' : 'Se creará un proyecto'}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function toForm(deliverable: CampaignDeliverable) {
  return {
    title: deliverable.title,
    description: deliverable.description ?? '',
    type: deliverable.type,
    platform: deliverable.platform ?? '',
    format: deliverable.format ?? '',
    objective: deliverable.objective ?? '',
  };
}
