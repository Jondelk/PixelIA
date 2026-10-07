import {
  ANIMATION_PERSONALITY_LABELS,
  AVATAR_TYPE_LABELS,
  type AvatarProfile,
  type AvatarResponse,
} from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PixelMark } from '../../components/PixelMark';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useCompany } from '../companies/companyContext';
import { generateAvatar, getAvatar } from './avatarApi';
import {
  BODY_SHAPE_LABEL,
  EYES_LABEL,
  FACE_STYLE_LABEL,
  FINISH_LABEL,
  MOUTH_LABEL,
  PACE_LABEL,
} from './labels';
import { PixelPreview } from './PixelPreview';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

export function PixelPage() {
  const { company, reload: reloadCompany } = useCompany();
  const { state, reload } = useResource(`avatar:${company.id}`, (signal) =>
    getAvatar(company.id, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-accent" /> Cargando tu Pixel…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  if (!state.data.brandDnaVersion) {
    return (
      <EmptyState
        icon="pixel"
        title="Pixel aún no conoce esta marca"
        description="Para crear su personaje, Pixel necesita primero el ADN de la marca. Completa el onboarding de 8 pasos."
        action={
          <Link
            to={`${companyBasePath(company.id)}/onboarding`}
            className={buttonClasses('primary')}
          >
            Ir al onboarding <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      />
    );
  }

  return (
    <PixelStudio
      key={company.id}
      companyId={company.id}
      companyName={company.name}
      initial={state.data}
      onGenerated={reloadCompany}
    />
  );
}

function PixelStudio({
  companyId,
  companyName,
  initial,
  onGenerated,
}: {
  companyId: string;
  companyName: string;
  initial: AvatarResponse;
  onGenerated: () => void;
}) {
  const [data, setData] = useState(initial);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      setData(await generateAvatar(companyId));
      onGenerated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  if (!data.avatar) {
    return (
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-12 sm:px-12">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[320px_1fr]">
          <div className="mx-auto grid size-64 place-items-center rounded-full border border-dashed border-line-strong">
            <PixelMark className="size-24 opacity-80 drop-shadow-[0_0_30px_rgba(34,211,238,0.4)]" />
          </div>
          <div className="max-w-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Avatar Concept Engine
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {companyName} ya tiene ADN. Ahora puede tener cuerpo.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Pixel combinará el sector, la historia, la personalidad, el arquetipo, la estética,
              los colores y las restricciones de la marca para diseñar un personaje único. No es una
              mascota al azar: cada decisión tendrá una razón.
            </p>
            {error && (
              <div className="mt-6">
                <Alert>{error}</Alert>
              </div>
            )}
            <Button className="mt-8" onClick={generate} loading={generating}>
              {!generating && <Icon name="sparkle" className="size-4" />} Crear mi Pixel
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <AvatarConceptView
      avatar={data.avatar}
      response={data}
      generating={generating}
      error={error}
      onRegenerate={generate}
    />
  );
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface/80 p-6 ${className}`}>
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chips({
  items,
  tone = 'default',
}: {
  items: string[];
  tone?: 'default' | 'accent' | 'danger';
}) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  const style = {
    default: 'border-line-strong text-fg/90',
    accent: 'border-accent/40 bg-accent/[0.07] text-accent-soft',
    danger: 'border-rose-500/30 bg-rose-500/[0.06] text-rose-200',
  }[tone];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-full border px-3 py-1 text-[13px] ${style}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-fg/90">{children}</dd>
    </div>
  );
}

function AvatarConceptView({
  avatar,
  response,
  generating,
  error,
  onRegenerate,
}: {
  avatar: AvatarProfile;
  response: AvatarResponse;
  generating: boolean;
  error: string | null;
  onRegenerate: () => void;
}) {
  const colors = [
    { label: 'Principal', ...avatar.primaryColor },
    { label: 'Secundario', ...avatar.secondaryColor },
    { label: 'Acento', ...avatar.accentColor },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      {/* Columna izquierda: vista provisional y acciones */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="animate-rise relative overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <PixelPreview
            key={avatar.id}
            profile={avatar}
            className="relative mx-auto h-80 w-full max-w-sm"
          />
          <p className="relative border-t border-line px-5 py-3 text-center font-mono text-[11px] text-subtle">
            Vista provisional · el modelo 3D llegará después
          </p>
        </section>

        {response.isStale && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
            El ADN de la marca cambió desde que se creó este concepto. Regenera para actualizarlo.
          </div>
        )}
        {error && <Alert>{error}</Alert>}

        <Button variant="secondary" className="w-full" onClick={onRegenerate} loading={generating}>
          {!generating && <Icon name="sparkle" className="size-4 text-accent" />} Regenerar concepto
        </Button>

        {response.history.length > 1 && (
          <section className="rounded-2xl border border-line bg-surface/80 p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-subtle">Versiones</h2>
            <ol className="mt-3 space-y-2">
              {response.history.map((item) => (
                <li key={item.version} className="flex items-center justify-between gap-3 text-sm">
                  <span className={item.version === avatar.version ? 'text-fg' : 'text-muted'}>
                    v{item.version} · {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-subtle">
                    ADN v{item.brandDnaVersion} · {dateFormat.format(new Date(item.createdAt))}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {/* Columna derecha: el concepto */}
      <div className="space-y-5">
        <header
          className="animate-rise rounded-3xl border border-line bg-surface p-6 sm:p-8"
          style={{ animationDelay: '80ms' }}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            {AVATAR_TYPE_LABELS[avatar.avatarType]} · versión {avatar.version}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {avatar.name}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg/90">{avatar.concept}</p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <Field label="Objeto base">{avatar.baseObject.label}</Field>
            <Field label="Cuerpo">{BODY_SHAPE_LABEL[avatar.bodyShape]}</Field>
            <Field label="Rostro">
              {FACE_STYLE_LABEL[avatar.faceStyle]} · ojos {EYES_LABEL[avatar.eyesStyle]},{' '}
              {MOUTH_LABEL[avatar.mouthStyle]}
            </Field>
          </dl>
        </header>

        <section
          className="animate-rise rounded-2xl border border-accent/25 bg-accent/[0.04] p-6"
          style={{ animationDelay: '140ms' }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
            Razón creativa
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-fg">{avatar.rationale.summary}</p>
          <details className="group mt-4">
            <summary className="cursor-pointer text-sm text-accent hover:text-accent-soft">
              Ver cada decisión y de qué parte del ADN sale
            </summary>
            <ul className="mt-4 space-y-4">
              {avatar.rationale.decisions.map((decision) => (
                <li key={decision.attribute} className="border-l border-line-strong pl-4">
                  <p className="text-sm text-fg/90">{decision.reason}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {decision.sources.map((source) => (
                      <code
                        key={source}
                        className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-subtle"
                      >
                        {source}
                      </code>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Personalidad">
            <Chips items={avatar.personalityTraits} tone="accent" />
            <dl className="mt-5 space-y-4">
              <Field label="Cómo se mueve">
                {ANIMATION_PERSONALITY_LABELS[avatar.animationPersonality]}
              </Field>
              <Field label="En reposo">{avatar.idleBehavior.description}</Field>
              <Field
                label={`Al hablar · ritmo ${PACE_LABEL[avatar.speakingBehavior.pace].toLowerCase()}`}
              >
                {avatar.speakingBehavior.description}
              </Field>
              <Field label={`Expresividad · ${avatar.expressiveness}/100`}>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-elevated">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-electric to-accent"
                    style={{ width: `${avatar.expressiveness}%` }}
                  />
                </span>
              </Field>
            </dl>
          </Panel>

          <Panel title="Colores">
            <ul className="space-y-3">
              {colors.map((color) => (
                <li key={color.label} className="flex items-center gap-3">
                  <span
                    className="size-11 shrink-0 rounded-xl border border-line-strong"
                    style={{ background: color.hex }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{color.name}</span>
                    <span className="block font-mono text-[11px] text-subtle">
                      {color.label} · {color.hex}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Materiales">
            <Chips items={avatar.materials} />
            <p className="mt-4 text-xs text-subtle">
              Acabado {FINISH_LABEL[avatar.renderHints.finish]} · redondez{' '}
              {Math.round(avatar.renderHints.roundness * 100)} %
            </p>
          </Panel>

          <Panel title="Accesorios">
            {avatar.accessories.length ? (
              <ul className="space-y-2">
                {avatar.accessories.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-fg/90">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">Sin accesorios: la marca pide una forma limpia.</p>
            )}
          </Panel>

          <Panel title="Palabras clave visuales">
            <Chips items={avatar.visualKeywords} tone="accent" />
          </Panel>

          <Panel title="Pixel debe evitar">
            <Chips items={avatar.avoid} tone="danger" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
