import {
  ANIMATION_PERSONALITY_LABELS,
  AVATAR_TYPE_LABELS,
  type AvatarProfile,
  type AvatarResponse,
} from '@pixel/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { companyApiBase } from '../../lib/apiPaths';
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
import { AvatarStage } from '../avatar3d/AvatarStage';
import { AvatarStateControls } from '../avatar3d/AvatarStateControls';
import type { AvatarState } from '../avatar3d/pose';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

/** Personaje de una empresa (Enterprise). La UI es el PixelStudio compartido con Personal. */
export function PixelPage() {
  const { company, reload: reloadCompany } = useCompany();
  const apiBase = companyApiBase(company.id);
  const { state, reload } = useResource(`avatar:${company.id}`, (signal) =>
    getAvatar(apiBase, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Cargando el personaje…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  if (!state.data.brandDnaVersion) {
    return (
      <EmptyState
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
      apiBase={apiBase}
      ownerName={company.name}
      kind="brand"
      initial={state.data}
      onGenerated={reloadCompany}
    />
  );
}

export type PixelKind = 'brand' | 'personal';

/**
 * Estudio del personaje, compartido por Enterprise y Personal (Pixel Core): misma API bajo
 * `apiBase` (la API decide si sale del BrandDNA o del PersonalDNA), mismo renderer 3D y misma
 * vista del concepto. Solo cambian los textos según `kind`.
 */
export function PixelStudio({
  apiBase,
  ownerName,
  kind,
  initial,
  onGenerated,
}: {
  apiBase: string;
  ownerName: string;
  kind: PixelKind;
  initial: AvatarResponse;
  onGenerated: () => void;
}) {
  const [data, setData] = useState(initial);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');

  // Tras un concepto nuevo, Pixel celebra unos segundos y vuelve al reposo.
  useEffect(() => {
    if (avatarState !== 'happy') return;
    const timer = window.setTimeout(() => setAvatarState('idle'), 2600);
    return () => window.clearTimeout(timer);
  }, [avatarState]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setAvatarState('thinking');
    try {
      setData(await generateAvatar(apiBase));
      onGenerated();
      setAvatarState('happy');
    } catch (err) {
      setError(errorMessage(err));
      setAvatarState('idle');
    } finally {
      setGenerating(false);
    }
  }

  if (!data.avatar) {
    return (
      <section className="rounded-3xl border border-line bg-surface px-6 py-14 sm:px-14">
        <div className="grid items-center gap-12 lg:grid-cols-[280px_1fr]">
          <Pixi size={220} className="mx-auto" />
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
              Avatar Concept Engine
            </p>
            <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {kind === 'personal'
                ? 'Ya te conozco. Ahora puedes tener tu personaje.'
                : `${ownerName} ya tiene ADN. Ahora puede tener cuerpo.`}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {kind === 'personal'
                ? 'Pixel combinará tu profesión, tus roles, tu personalidad, tu estilo, tus colores, tus intereses, tu forma de trabajar y lo que quieres evitar para diseñar un personaje único. No es una caricatura de tu oficio: cada decisión tendrá una razón.'
                : 'Pixel combinará el sector, la historia, la personalidad, el arquetipo, la estética, los colores y las restricciones de la marca para diseñar un personaje único. No es una mascota al azar: cada decisión tendrá una razón.'}
            </p>
            {error && (
              <div className="mt-6">
                <Alert>{error}</Alert>
              </div>
            )}
            <Button className="mt-8" onClick={generate} loading={generating}>
              {!generating && <Icon name="create" className="size-4" />}{' '}
              {kind === 'personal' ? 'Crear mi personaje' : 'Crear el personaje de tu marca'}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <AvatarConceptView
      kind={kind}
      avatar={data.avatar}
      response={data}
      generating={generating}
      error={error}
      onRegenerate={generate}
      avatarState={avatarState}
      onAvatarStateChange={setAvatarState}
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
    <section className={`rounded-2xl border border-line bg-surface p-6 ${className}`}>
      <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chips({
  items,
  tone = 'default',
}: {
  items: string[];
  tone?: 'default' | 'strong' | 'avoid';
}) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  const style = {
    default: 'border-line-strong text-fg',
    strong: 'border-line-strong bg-elevated font-medium text-fg',
    avoid: 'border-line text-muted line-through decoration-subtle',
  }[tone];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-md border px-3 py-1 text-[13px] ${style}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-1.5 text-sm text-fg">{children}</dd>
    </div>
  );
}

function AvatarConceptView({
  kind,
  avatar,
  response,
  generating,
  error,
  onRegenerate,
  avatarState,
  onAvatarStateChange,
}: {
  kind: PixelKind;
  avatar: AvatarProfile;
  response: AvatarResponse;
  generating: boolean;
  error: string | null;
  onRegenerate: () => void;
  avatarState: AvatarState;
  onAvatarStateChange: (state: AvatarState) => void;
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
        <section className="animate-rise overflow-hidden rounded-3xl border border-line bg-surface">
          <AvatarStage avatar={avatar} state={avatarState} className="!h-80 sm:!h-96" />
          <p className="border-t border-line px-5 py-3 text-center text-[11px] uppercase tracking-[0.16em] text-subtle">
            Avatar paramétrico · arrastra para girarlo
          </p>
        </section>

        {import.meta.env.DEV && (
          <AvatarStateControls value={avatarState} onChange={onAvatarStateChange} />
        )}

        {response.isStale && (
          <Alert>
            {kind === 'personal'
              ? 'Tu ADN personal cambió desde que se creó este concepto. Regenera para actualizarlo.'
              : 'El ADN de la marca cambió desde que se creó este concepto. Regenera para actualizarlo.'}
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}

        <Button variant="secondary" className="w-full" onClick={onRegenerate} loading={generating}>
          {!generating && <Icon name="create" className="size-4" />} Regenerar concepto
        </Button>

        {response.history.length > 1 && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              Versiones
            </h2>
            <ol className="mt-3 space-y-2">
              {response.history.map((item) => (
                <li key={item.version} className="flex items-center justify-between gap-3 text-sm">
                  <span className={item.version === avatar.version ? 'text-fg' : 'text-muted'}>
                    v{item.version} · {item.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                    ADN v{item.dnaVersion} · {dateFormat.format(new Date(item.createdAt))}
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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            {AVATAR_TYPE_LABELS[avatar.avatarType]} · versión {avatar.version}
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {avatar.name}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">{avatar.concept}</p>
          <dl className="mt-8 grid gap-5 sm:grid-cols-3">
            <Field label={kind === 'personal' ? 'Inspiración' : 'Objeto base'}>
              {avatar.baseObject.label}
            </Field>
            <Field label="Cuerpo">{BODY_SHAPE_LABEL[avatar.bodyShape]}</Field>
            <Field label="Rostro">
              {FACE_STYLE_LABEL[avatar.faceStyle]} · ojos {EYES_LABEL[avatar.eyesStyle]},{' '}
              {MOUTH_LABEL[avatar.mouthStyle]}
            </Field>
          </dl>
        </header>

        <section
          className="animate-rise rounded-2xl bg-brand p-6 text-on-brand sm:p-8"
          style={{ animationDelay: '140ms' }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em]">Razón creativa</p>
          <p className="mt-4 text-[15px] leading-relaxed">{avatar.rationale.summary}</p>
          <details className="group mt-4">
            <summary className="cursor-pointer text-sm font-medium underline decoration-on-brand/40 underline-offset-4 hover:decoration-on-brand">
              Ver cada decisión y de qué parte del ADN sale
            </summary>
            <ul className="mt-4 space-y-4">
              {avatar.rationale.decisions.map((decision) => (
                <li key={decision.attribute} className="border-l border-on-brand/40 pl-4">
                  <p className="text-sm">{decision.reason}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {decision.sources.map((source) => (
                      <code
                        key={source}
                        className="rounded-sm bg-on-brand/15 px-1.5 py-0.5 text-[10px]"
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
            <Chips items={avatar.personalityTraits} tone="strong" />
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
                <span className="mt-1 block h-1 overflow-hidden bg-elevated">
                  <span
                    className="block h-full bg-fg"
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
                    className="size-11 shrink-0 rounded-lg border border-line-strong"
                    style={{ background: color.hex }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{color.name}</span>
                    <span className="block text-[11px] tabular-nums text-subtle">
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
                  <li key={item} className="flex gap-2.5 text-sm text-fg">
                    <span className="mt-2 size-1 shrink-0 bg-subtle" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">
                {kind === 'personal'
                  ? 'Sin accesorios: tu estilo pide una forma limpia.'
                  : 'Sin accesorios: la marca pide una forma limpia.'}
              </p>
            )}
          </Panel>

          <Panel title="Palabras clave visuales">
            <Chips items={avatar.visualKeywords} tone="strong" />
          </Panel>

          <Panel title="El personaje evita">
            <Chips items={avatar.avoid} tone="avoid" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
