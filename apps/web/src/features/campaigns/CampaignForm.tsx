import { CAMPAIGN_TYPE_LABELS, type CampaignType } from '@pixel/contracts';
import type { FormEvent } from 'react';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import type { FieldErrors } from '../../lib/forms';
import { TagInput } from '../onboarding/TagInput';
import { labelOptions } from '../operations/labels';
import type { CampaignFormState } from './campaignLogic';

const typeOptions = labelOptions(CAMPAIGN_TYPE_LABELS);

/**
 * Brief de una campaña. `manual`: nombre y objetivo (sin IA). `pixel`: el brief para que Pixel
 * construya la estrategia desde el ADN de la marca; solo el objetivo es obligatorio. El estado vive
 * en la página: si la generación falla, lo escrito se conserva.
 */
export function CampaignForm({
  mode,
  form,
  onChange,
  errors,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: 'manual' | 'pixel';
  form: CampaignFormState;
  onChange: (form: CampaignFormState) => void;
  errors: FieldErrors;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set =
    <K extends keyof CampaignFormState>(key: K) =>
    (value: CampaignFormState[K]) =>
      onChange({ ...form, [key]: value });
  const pixel = mode === 'pixel';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={pixel ? 'Crear estrategia con Pixel' : 'Nueva campaña'}
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <div>
        <h2 className="font-display text-base font-bold">
          {pixel ? 'Crear estrategia con Pixel' : 'Nueva campaña'}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {pixel
            ? 'Cuéntale a Pixel qué necesita el negocio. Construirá la estrategia desde el ADN de la marca; solo el objetivo es obligatorio.'
            : 'Crea la campaña a mano. Podrás pedirle a Pixel su estrategia cuando quieras.'}
        </p>
      </div>
      <TextField
        label={pixel ? 'Nombre (opcional)' : 'Nombre'}
        value={form.name}
        onChange={(event) => set('name')(event.target.value)}
        error={errors.name}
        placeholder="Lanzamiento nueva presentación"
        maxLength={120}
        required={!pixel}
        autoFocus
      />
      <TextAreaField
        label="Objetivo"
        value={form.objective}
        onChange={(event) => set('objective')(event.target.value)}
        error={errors.objective}
        placeholder="Presentar la nueva presentación de 500 g y reforzar el origen"
        maxLength={500}
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField<CampaignType>
          label="Tipo de campaña"
          value={form.campaignType}
          options={typeOptions}
          placeholder="Sin definir"
          onValueChange={set('campaignType')}
        />
        <TextField
          label="Producto o servicio"
          value={form.productOrService}
          onChange={(event) => set('productOrService')(event.target.value)}
          error={errors.productOrService}
          maxLength={200}
        />
      </div>
      {pixel && (
        <>
          <TagInput
            label="Público (opcional)"
            values={form.targetAudience}
            onChange={set('targetAudience')}
            error={errors.targetAudience}
            max={8}
            placeholder="Si no lo indicas, Pixel usa la audiencia del ADN"
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextAreaField
              label="Problema (opcional)"
              value={form.problem}
              onChange={(event) => set('problem')(event.target.value)}
              error={errors.problem}
              maxLength={1000}
            />
            <TextAreaField
              label="Resultado deseado (opcional)"
              value={form.desiredOutcome}
              onChange={(event) => set('desiredOutcome')(event.target.value)}
              error={errors.desiredOutcome}
              maxLength={1000}
            />
          </div>
        </>
      )}
      <TagInput
        label="Canales"
        values={form.channels}
        onChange={set('channels')}
        error={errors.channels}
        max={8}
        placeholder={
          pixel ? 'Si no indicas ninguno, Pixel sugerirá algunos y dirá por qué' : 'Instagram'
        }
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Inicio"
          type="date"
          value={form.startDate}
          onChange={(event) => set('startDate')(event.target.value)}
          error={errors.startDate}
        />
        <TextField
          label="Fin"
          type="date"
          value={form.endDate}
          onChange={(event) => set('endDate')(event.target.value)}
          error={errors.endDate}
        />
      </div>
      {pixel && (
        <div className="grid gap-5 sm:grid-cols-2">
          <TagInput
            label="Restricciones"
            values={form.constraints}
            onChange={set('constraints')}
            error={errors.constraints}
            max={10}
            placeholder="Lo que la campaña no puede hacer"
          />
          <TagInput
            label="Elementos obligatorios"
            values={form.mandatoryElements}
            onChange={set('mandatoryElements')}
            error={errors.mandatoryElements}
            max={10}
            placeholder="Lo que tiene que aparecer"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" loading={busy}>
          {pixel ? (
            <>
              <Icon name="create" className="size-4" /> Construir estrategia
            </>
          ) : (
            'Crear campaña'
          )}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
