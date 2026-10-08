import {
  CONTENT_PLAN_MAX_DAYS,
  GenerateContentPlanSchema,
  type ContentPlan,
  type ContentPlanItem,
  type ContentPlatform,
  type GenerateContentPlanInput,
} from '@pixel/contracts';
import { zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { errorReason } from '../../lib/api';
import { isoToDateInput } from '../operations/dates';

/*
 * Lógica pura del Content Planner (formulario, periodos, mensajes de error). Sin React: se testea
 * directamente.
 */

export const PERIOD_OPTIONS = [
  { id: '7', label: '7 días', days: 7 },
  { id: '14', label: '2 semanas', days: 14 },
  { id: '30', label: '30 días', days: CONTENT_PLAN_MAX_DAYS },
] as const;
export type PeriodOption = (typeof PERIOD_OPTIONS)[number]['id'];

export interface GeneratePlanFormState {
  startDate: string;
  period: PeriodOption;
  goal: string;
  /** '' = según el ADN personal. */
  frequency: string;
  platforms: ContentPlatform[];
}

const pad = (value: number) => String(value).padStart(2, '0');
const dayString = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Próximo lunes (o hoy si es lunes), en el calendario local. */
export function nextMonday(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (8 - date.getDay()) % 7;
  date.setDate(date.getDate() + offset);
  return dayString(date);
}

/** Último día del periodo (ambos extremos incluidos). */
export function periodEnd(startDate: string, days: number): string {
  const [year, month, day] = startDate.split('-').map(Number) as [number, number, number];
  return dayString(new Date(year, month - 1, day + days - 1));
}

export function defaultGenerateForm(now = new Date()): GeneratePlanFormState {
  return { startDate: nextMonday(now), period: '14', goal: '', frequency: '', platforms: [] };
}

export type GenerateFormResult =
  | { ok: true; input: Omit<GenerateContentPlanInput, 'tzOffset'> }
  | { ok: false; errors: FieldErrors };

/** Formulario → petición, validada con el MISMO schema que la API. */
export function generateFormToInput(form: GeneratePlanFormState): GenerateFormResult {
  const days = PERIOD_OPTIONS.find((option) => option.id === form.period)?.days ?? 14;
  const input: Omit<GenerateContentPlanInput, 'tzOffset'> = {
    startDate: form.startDate,
    endDate: form.startDate ? periodEnd(form.startDate, days) : '',
    ...(form.frequency ? { frequency: Number(form.frequency) } : {}),
    ...(form.platforms.length ? { platforms: form.platforms } : {}),
    ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
  };
  const parsed = GenerateContentPlanSchema.safeParse({ ...input, tzOffset: 0 });
  return parsed.success ? { ok: true, input } : { ok: false, errors: zodFieldErrors(parsed.error) };
}

/** Regenerar: mismo periodo, objetivo y plataformas; crea un plan nuevo. */
export function regenerateInput(plan: ContentPlan): Omit<GenerateContentPlanInput, 'tzOffset'> {
  return {
    startDate: plan.period.startDate,
    endDate: plan.period.endDate,
    regenerateFrom: plan.id,
    ...(plan.platforms.length ? { platforms: plan.platforms } : {}),
    ...(plan.generation?.requestedGoal ? { goal: plan.generation.requestedGoal } : {}),
    ...(plan.generation?.frequencySource === 'request'
      ? { frequency: plan.generation.frequencyPerWeek }
      : {}),
  };
}

/** Mensaje para cada error de generación conocido (sin inventar un plan de relleno). */
export function generationErrorMessage(err: unknown): { title: string; reason: string | null } {
  const reason = errorReason(err);
  switch (reason) {
    case 'personal_context_not_configured':
      return { title: 'Pixel aún no conoce tu ADN personal', reason };
    case 'content_plan_generation_unavailable':
      return { title: 'La generación de planes no está disponible ahora mismo', reason };
    case 'content_plan_generation_failed':
      return { title: 'Pixel no pudo construir un plan fundamentado', reason };
    case 'content_platforms_missing':
      return { title: 'Elige al menos una plataforma', reason };
    default:
      return { title: 'No se pudo crear el plan', reason };
  }
}

const dayFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

/** "12 oct – 25 oct" a partir de días "YYYY-MM-DD". */
export function periodLabel(plan: Pick<ContentPlan, 'period'>): string {
  const toDate = (day: string) => {
    const [year, month, date] = day.split('-').map(Number) as [number, number, number];
    return new Date(year, month - 1, date);
  };
  const format = (day: string) => dayFormat.format(toDate(day)).replace('.', '');
  return `${format(plan.period.startDate)} – ${format(plan.period.endDate)}`;
}

/** Orden de las propuestas: por fecha sugerida. */
export function sortItems(items: readonly ContentPlanItem[]): ContentPlanItem[] {
  return [...items].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
}

export function itemEditForm(item: ContentPlanItem) {
  return {
    title: item.title,
    concept: item.concept ?? '',
    hook: item.hook ?? '',
    platform: item.platform ?? ('' as const),
    format: item.format ?? ('' as const),
    scheduledFor: isoToDateInput(item.scheduledFor),
  };
}
export type ItemEditForm = ReturnType<typeof itemEditForm>;
