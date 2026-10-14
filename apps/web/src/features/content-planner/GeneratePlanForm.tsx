import {
  CONTENT_PLATFORM_LABELS,
  type Campaign,
  type ContentPlatform,
  type GenerateContentPlanInput,
} from '@pixel/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
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
  PERSONAL_PLANNER_COPY,
  type GeneratePlanFormState,
  type PlannerCopy,
} from './plannerLogic';

const PLATFORMS = Object.keys(CONTENT_PLATFORM_LABELS).filter(
  (value) => value !== 'other',
) as ContentPlatform[];

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 7].map((value) => ({
  value: String(value),
  label: `${value} por semana`,
}));

/**
 * Periodo, objetivo, frecuencia y plataformas (y, en un Pixel de empresa, la campaña opcional).
 * Todo menos el periodo es opcional. El formulario sigue montado mientras Pixel genera: si falla,
 * conserva lo que el usuario rellenó.
 */
export function GeneratePlanForm({
  onGenerate,
  onCancel,
  busy,
  copy = PERSONAL_PLANNER_COPY,
  campaigns,
  initialCampaignId = '',
  campaignSummary,
}: {
  onGenerate: (input: Omit<GenerateContentPlanInput, 'tzOffset'>) => void;
  onCancel?: () => void;
  busy: boolean;
  copy?: PlannerCopy;
  /** Enterprise: campañas del workspace activo (solo esas). */
  campaigns?: readonly Campaign[];
  initialCampaignId?: string;
  /** Resumen compacto de la campaña elegida. */
  campaignSummary?: (campaign: Campaign) => ReactNode;
}) {
  const [form, setForm] = useState<GeneratePlanFormState>(() =>
    defaultGenerateForm(new Date(), initialCampaignId),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const set =
    <K extends keyof GeneratePlanFormState>(key: K) =>
    (value: GeneratePlanFormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }));
  const days = PERIOD_OPTIONS.find((option) => option.id === form.period)!.days;
  const selected = campaigns?.find((campaign) => campaign.id === form.campaignId) ?? null;

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
      {campaigns && (
        <div className="space-y-3">
          <SelectField
            label="¿Quieres basar este plan en una campaña?"
            value={form.campaignId}
            placeholder="Sin campaña"
            options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
            onValueChange={set('campaignId')}
            error={errors.campaignId}
          />
          {selected && campaignSummary?.(selected)}
        </div>
      )}
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
          label={copy.goalLabel}
          value={form.goal}
          onChange={(event) => set('goal')(event.target.value)}
          error={errors.goal}
          placeholder="Posicionamiento, lanzar un servicio, crecer comunidad…"
          maxLength={200}
        />
        <SelectField
          label="Frecuencia"
          value={form.frequency}
          placeholder={copy.frequencyPlaceholder}
          options={FREQUENCY_OPTIONS}
          onValueChange={set('frequency')}
          error={errors.frequency}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Plataformas</legend>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((platform) => {
            const isSelected = form.platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={isSelected}
                onClick={() => togglePlatform(platform)}
                className={[
                  'rounded-md border px-3 py-1.5 text-xs transition-colors',
                  isSelected
                    ? 'border-brand bg-brand text-on-brand'
                    : 'border-line-strong text-muted hover:border-fg hover:text-fg',
                ].join(' ')}
              >
                {CONTENT_PLATFORM_LABELS[platform]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-subtle">{copy.platformsHint}</p>
      </fieldset>

      <p className="flex items-start gap-3 border-t border-line pt-5 text-sm leading-relaxed text-muted">
        <span className="mt-2 size-1.5 shrink-0 bg-fg" aria-hidden="true" />
        {copy.formNote}
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
