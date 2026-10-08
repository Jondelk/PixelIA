import { CONTENT_PLATFORM_LABELS, type ContentPlatform } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import type { FieldErrors } from '../../lib/forms';
import { Segmented } from '../operations/ui';
import {
  defaultGenerateForm,
  generateFormToInput,
  PERIOD_OPTIONS,
  periodEnd,
  type GeneratePlanFormState,
} from './plannerLogic';
import type { GenerateContentPlanInput } from '@pixel/contracts';

const PLATFORMS = Object.keys(CONTENT_PLATFORM_LABELS).filter(
  (value) => value !== 'other',
) as ContentPlatform[];

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 7].map((value) => ({
  value: String(value),
  label: `${value} por semana`,
}));

/**
 * Periodo, objetivo, frecuencia y plataformas. Todo menos el periodo es opcional: sin frecuencia
 * ni plataformas, Pixel usa las de tu ADN personal.
 */
export function GeneratePlanForm({
  onGenerate,
  onCancel,
  busy,
}: {
  onGenerate: (input: Omit<GenerateContentPlanInput, 'tzOffset'>) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<GeneratePlanFormState>(() => defaultGenerateForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const set =
    <K extends keyof GeneratePlanFormState>(key: K) =>
    (value: GeneratePlanFormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }));
  const days = PERIOD_OPTIONS.find((option) => option.id === form.period)!.days;

  const togglePlatform = (platform: ContentPlatform) =>
    set('platforms')(
      form.platforms.includes(platform)
        ? form.platforms.filter((value) => value !== platform)
        : [...form.platforms, platform],
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = generateFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onGenerate(result.input);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Crear plan con Pixel"
      className="space-y-6 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField
          label="Empieza el"
          type="date"
          value={form.startDate}
          onChange={(event) => set('startDate')(event.target.value)}
          error={errors.startDate ?? errors.endDate}
          hint={form.startDate ? `Hasta el ${periodEnd(form.startDate, days)}` : undefined}
        />
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Periodo</p>
          <Segmented
            label="Periodo del plan"
            options={PERIOD_OPTIONS}
            value={form.period}
            onChange={set('period')}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <TextField
          label="Objetivo (opcional)"
          value={form.goal}
          onChange={(event) => set('goal')(event.target.value)}
          error={errors.goal}
          placeholder="Posicionamiento, lanzar un servicio, crecer comunidad…"
          maxLength={200}
        />
        <SelectField
          label="Frecuencia"
          value={form.frequency}
          placeholder="Según mi ADN"
          options={FREQUENCY_OPTIONS}
          onValueChange={set('frequency')}
          error={errors.frequency}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Plataformas</legend>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((platform) => {
            const selected = form.platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={selected}
                onClick={() => togglePlatform(platform)}
                className={[
                  'rounded-md border px-3 py-1.5 text-xs transition-colors',
                  selected
                    ? 'border-brand bg-brand text-on-brand'
                    : 'border-line-strong text-muted hover:border-fg hover:text-fg',
                ].join(' ')}
              >
                {CONTENT_PLATFORM_LABELS[platform]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-subtle">
          Si no eliges ninguna, Pixel usa solo las plataformas de tu ADN personal.
        </p>
      </fieldset>

      <p className="flex items-start gap-3 border-t border-line pt-5 text-sm leading-relaxed text-muted">
        <span className="mt-2 size-1.5 shrink-0 bg-fg" aria-hidden="true" />
        Pixel utilizará tu ADN personal y tus proyectos activos para construir el plan. Nada se
        publica ni pasa a Contenido hasta que aceptes cada propuesta.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}>
          <Icon name="create" className="size-4" /> Crear plan con Pixel
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
