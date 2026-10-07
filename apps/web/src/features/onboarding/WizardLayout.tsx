import type { FormEvent, ReactNode } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';

/*
 * Esqueleto de los onboardings por pasos (Brand Brain y Pixel Personal): progreso, lista de pasos,
 * formulario del paso actual y "Guardar y continuar". Cada onboarding aporta sus pasos, sus campos
 * y su guardado progresivo.
 */

export interface WizardStep {
  key: string;
  title: string;
}

export function WizardLayout({
  eyebrow,
  summary,
  steps,
  completed,
  current,
  onGo,
  asideFooter,
  heading,
  description,
  formError,
  saving,
  submitLabel,
  submitIcon,
  onSubmit,
  children,
}: {
  /** "Brand Brain" o "Pixel Personal". */
  eyebrow: string;
  /** Línea bajo el título del progreso, p. ej. "Café Tinto · 3 de 8 pasos". */
  summary: string;
  steps: WizardStep[];
  completed: readonly string[];
  current: string;
  onGo: (key: string) => void;
  asideFooter?: ReactNode;
  heading: string;
  description: string;
  formError: string | null;
  saving: boolean;
  submitLabel: string;
  submitIcon: 'arrowRight' | 'create';
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const index = steps.findIndex((step) => step.key === current);
  const percent = Math.round((completed.length / steps.length) * 100);
  const title = steps[index]?.title ?? '';

  return (
    <div className="grid gap-8 lg:grid-cols-[230px_1fr] lg:gap-10">
      <aside aria-label="Progreso del onboarding" className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
        <p className="mt-2 text-sm text-muted">{summary}</p>
        <div
          className="mt-4 h-1 overflow-hidden bg-elevated"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Progreso del onboarding"
        >
          <div
            className="h-full bg-brand transition-[width] duration-500 ease-pxl"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ol className="mt-6 hidden space-y-1 lg:block">
          {steps.map((step, i) => {
            const done = completed.includes(step.key);
            const active = step.key === current;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => onGo(step.key)}
                  aria-current={active ? 'step' : undefined}
                  className={[
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    active ? 'bg-elevated font-medium text-fg' : 'text-muted hover:text-fg',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'grid size-6 shrink-0 place-items-center rounded-md border text-[11px]',
                      done
                        ? 'border-brand bg-brand text-on-brand'
                        : active
                          ? 'border-fg text-fg'
                          : 'border-line-strong text-subtle',
                    ].join(' ')}
                  >
                    {done ? <Icon name="check" className="size-3.5" /> : i + 1}
                  </span>
                  {step.title}
                </button>
              </li>
            );
          })}
        </ol>

        {asideFooter}
      </aside>

      <form
        onSubmit={onSubmit}
        noValidate
        className="animate-rise rounded-2xl border border-line bg-surface p-5 sm:p-10"
        key={current}
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
          Paso {index + 1} de {steps.length} · {title}
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {heading}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{description}</p>

        <div className="mt-8 space-y-5">
          {formError && <Alert>{formError}</Alert>}
          {children}
        </div>

        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            disabled={index <= 0 || saving}
            onClick={() => onGo(steps[index - 1]!.key)}
          >
            <Icon name="arrowLeft" className="size-4" /> Atrás
          </Button>
          <Button type="submit" loading={saving}>
            {submitLabel}
            {!saving && <Icon name={submitIcon} className="size-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
