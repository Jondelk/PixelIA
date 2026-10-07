import {
  BRAND_ARCHETYPES,
  ENERGY_LEVELS,
  FORMALITY_LEVELS,
  LANGUAGES,
  PERSONAL_ONBOARDING_STEPS,
  type PersonalDna,
  type PersonalDnaCompleteness,
} from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { BulletList, Chips, Label, Meter, Section } from '../../components/DnaBlocks';
import { rise } from '../../components/rise';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { brandAssets } from '../../brand/assets';
import { workspaceBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import { generatePersonalDna, getPersonalDna } from './personalApi';
import { personalUnderstanding } from './personalSummary';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

/** /workspace/:workspaceId/personal/dna — "Así te entiende Pixel". */
export function PersonalDnaPage() {
  const { overview, reload: reloadWorkspace } = useWorkspace();
  const { workspace, personal } = overview;
  const [searchParams] = useSearchParams();
  const { state, reload } = useResource(`personal-dna:${workspace.id}`, (signal) =>
    getPersonalDna(workspace.id, signal),
  );
  const base = workspaceBasePath(workspace.id);
  const onboardingHref = `${base}/personal/onboarding`;

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Cargando lo que Pixel sabe de ti…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  const { personalDna, completeness } = state.data;
  if (personalDna && completeness) {
    return (
      <PersonalDnaView
        dna={personalDna}
        completeness={completeness}
        base={base}
        justLearned={searchParams.has('learned')}
      />
    );
  }

  const done = personal?.completedSteps ?? 0;
  const total = PERSONAL_ONBOARDING_STEPS.length;
  if (done === total) {
    // Onboarding completo sin ADN (p. ej. un fallo al generarlo): se puede generar a mano.
    return (
      <GenerateDna
        workspaceId={workspace.id}
        onGenerated={() => {
          reload();
          reloadWorkspace();
        }}
      />
    );
  }
  return (
    <EmptyState
      title={done === 0 ? 'Pixel aún no te conoce' : 'Pixel está aprendiendo de ti'}
      description={
        done === 0
          ? 'Responde el onboarding personal en 8 pasos. Con tus respuestas, Pixel construirá tu ADN personal.'
          : `Llevas ${done} de ${total} pasos. Complétalos para que Pixel genere tu ADN personal.`
      }
      action={
        <Link to={onboardingHref} className={buttonClasses('primary')}>
          {done === 0 ? 'Empezar' : 'Continuar'} <Icon name="arrowRight" className="size-4" />
        </Link>
      }
    />
  );
}

function GenerateDna({
  workspaceId,
  onGenerated,
}: {
  workspaceId: string;
  onGenerated: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await generatePersonalDna(workspaceId);
      onGenerated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }
  return (
    <EmptyState
      title="Tus respuestas están listas"
      description="Pixel puede construir ahora tu ADN personal a partir de ellas."
      action={
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Button onClick={generate} loading={generating}>
            {!generating && <Icon name="create" className="size-4" />} Generar mi ADN
          </Button>
        </div>
      }
    />
  );
}

/** Grupo con etiqueta que solo aparece si hay datos: un resumen, no un formulario. */
function Group({ label, children, show }: { label: string; children: ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChipGroup({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: 'default' | 'strong' | 'muted';
}) {
  return (
    <Group label={label} show={items.length > 0}>
      <Chips items={items} tone={tone} />
    </Group>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="text-sm text-subtle">{children}</p>;
}

export function PersonalDnaView({
  dna,
  completeness,
  base,
  justLearned,
}: {
  dna: PersonalDna;
  completeness: PersonalDnaCompleteness;
  base: string;
  justLearned: boolean;
}) {
  const firstName = dna.identity.name.split(' ')[0] ?? dna.identity.name;
  const understanding = personalUnderstanding(dna);
  const c = dna.communication;
  const goals: [string, string[]][] = [
    ['Profesionales', dna.goals.professional],
    ['Personales', dna.goals.personal],
    ['De contenido', dna.goals.content],
    ['A corto plazo', dna.goals.shortTerm],
    ['A largo plazo', dna.goals.longTerm],
  ];
  const work: [string, string[]][] = [
    ['Horario', dna.workStyle.preferredWorkTimes],
    ['Planificas', dna.workStyle.planningStyle],
    ['Ejecutas', dna.workStyle.executionStyle],
    ['Te concentras', dna.workStyle.focusStyle],
    ['Productividad', dna.workStyle.productivityPreferences],
  ];
  const hasWork = work.some(([, items]) => items.length > 0);

  return (
    <div className="space-y-5">
      {/* El momento de Pixel: bloque azul PIXELES, texto blanco. */}
      <header className="rounded-3xl bg-brand px-6 py-12 text-on-brand sm:px-12 sm:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="animate-rise flex items-center gap-4">
              <img src={brandAssets.logo.isotipoOnBrand} alt="" width={24} height={32} />
              <p className="text-xs font-medium uppercase tracking-[0.2em]">
                Pixel Personal · versión {dna.version}
              </p>
            </div>
            <h1
              className="animate-rise mt-8 font-display text-3xl font-bold tracking-tight sm:text-5xl sm:leading-[1.08]"
              style={rise(0)}
            >
              Así te entiende Pixel
            </h1>
            <p className="animate-rise mt-5 text-sm" style={rise(1)}>
              {justLearned
                ? `Listo, ${firstName}. Esto es lo que aprendí de ti.`
                : `Lo que Pixel sabe de ti, aprendido el ${dateFormat.format(new Date(dna.createdAt))}.`}
            </p>
            {understanding.length > 0 && (
              <blockquote
                className="animate-rise mt-10 border-l-2 border-on-brand pl-6 text-xl font-medium leading-snug sm:text-2xl"
                style={rise(2)}
              >
                {understanding.join(' ')}
              </blockquote>
            )}
          </div>
          <Link
            to={`${base}/personal/onboarding`}
            className={`${buttonClasses('ghost', 'border border-on-brand text-on-brand hover:bg-on-brand hover:text-brand')} animate-rise shrink-0 self-start lg:self-auto`}
            style={rise(3)}
          >
            Editar mi información
          </Link>
        </div>
      </header>

      {/* Completitud */}
      <section
        className="animate-rise flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8"
        style={rise(3)}
      >
        <div className="sm:w-64">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-subtle">
            Completitud
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {completeness.percent} %
          </p>
          <div
            className="mt-3 h-1 overflow-hidden bg-elevated"
            role="meter"
            aria-label="Completitud del ADN personal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completeness.percent}
          >
            <div className="h-full bg-fg" style={{ width: `${completeness.percent}%` }} />
          </div>
        </div>
        <p className="flex-1 text-sm leading-relaxed text-muted">
          {completeness.missing.length === 0
            ? 'Pixel tiene todo lo que necesita para trabajar contigo.'
            : `Para afinar mis propuestas me falta: ${completeness.missing.join(', ').toLocaleLowerCase('es')}. Lo que no me cuentes, no lo supondré.`}
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section eyebrow="Quién eres" title="Identidad" step={4}>
          <Chips items={dna.identity.professionalIdentity} tone="strong" />
          {dna.identity.summary && (
            <p className="mt-5 text-sm leading-relaxed text-fg">{dna.identity.summary}</p>
          )}
          <div className="mt-5 space-y-5">
            <ChipGroup label="Intereses" items={dna.identity.interests} tone="muted" />
          </div>
        </Section>

        <Section eyebrow="Qué haces" title="Roles y habilidades" step={5}>
          <div className="space-y-5">
            <ChipGroup label="Roles" items={dna.professionalProfile.roles} tone="strong" />
            <ChipGroup label="Habilidades" items={dna.professionalProfile.skills} />
            <ChipGroup label="Fortalezas" items={dna.professionalProfile.strengths} tone="muted" />
            {dna.professionalProfile.roles.length + dna.professionalProfile.skills.length === 0 && (
              <Missing>Aún no me contaste tus roles ni tus habilidades.</Missing>
            )}
          </div>
        </Section>

        <Section eyebrow="Qué quieres" title="Objetivos" step={6}>
          <div className="space-y-5">
            {goals.map(([label, items]) => (
              <Group key={label} label={label} show={items.length > 0}>
                <BulletList items={items} icon="check" />
              </Group>
            ))}
          </div>
        </Section>

        <Section eyebrow="A quién le hablas" title="Audiencia" step={7}>
          {dna.audience.primaryAudience ? (
            <p className="text-sm leading-relaxed text-fg">{dna.audience.primaryAudience}</p>
          ) : (
            <Missing>Aún no me contaste quién es tu público principal.</Missing>
          )}
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Group label="Necesita" show={dna.audience.needs.length > 0}>
              <BulletList items={dna.audience.needs} />
            </Group>
            <Group label="Le frustra" show={dna.audience.problems.length > 0}>
              <BulletList items={dna.audience.problems} />
            </Group>
          </div>
          <div className="mt-5 space-y-5">
            <ChipGroup
              label="También le hablas a"
              items={dna.audience.secondaryAudiences}
              tone="muted"
            />
            <ChipGroup
              label="Cómo quieres que te perciban"
              items={dna.audience.desiredPerception}
              tone="strong"
            />
          </div>
        </Section>

        <Section eyebrow="Cómo eres" title="Personalidad" step={8}>
          <Chips items={dna.personality.traits} tone="strong" />
          {dna.personality.archetypes.length > 0 && (
            <div className="mt-6 space-y-3">
              {dna.personality.archetypes.map((id, index) => (
                <div key={id}>
                  <p
                    className={
                      index === 0
                        ? 'font-display text-2xl font-bold tracking-tight'
                        : 'text-sm text-muted'
                    }
                  >
                    {index === 0
                      ? BRAND_ARCHETYPES[id].name
                      : `Con matices de ${BRAND_ARCHETYPES[id].name}`}
                  </p>
                  {index === 0 && (
                    <p className="mt-1 text-sm italic text-muted">“{BRAND_ARCHETYPES[id].motto}”</p>
                  )}
                </div>
              ))}
              <p className="text-xs text-subtle">Lo deduje de los rasgos que elegiste.</p>
            </div>
          )}
        </Section>

        <Section eyebrow="Cómo hablas" title="Tono" step={9}>
          <Chips items={c.tone} tone="strong" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Formalidad</Label>
              <Meter level={c.formality} label={FORMALITY_LEVELS[c.formality - 1] ?? ''} />
            </div>
            <div>
              <Label>Energía</Label>
              <Meter level={c.energy} label={ENERGY_LEVELS[c.energy - 1] ?? ''} />
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">
            Idioma: <span className="text-fg">{LANGUAGES[c.language]}</span>
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ChipGroup label="Palabras tuyas" items={c.preferredWords} />
            <ChipGroup label="Nunca dirías" items={c.avoidWords} tone="muted" />
          </div>
        </Section>

        <Section eyebrow="Cómo se ve" title="Estilo creativo" step={10} className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <ChipGroup label="Estilos" items={dna.creativeIdentity.styles} tone="strong" />
              <ChipGroup label="Preferencias" items={dna.creativeIdentity.visualPreferences} />
              <ChipGroup label="Referencias" items={dna.creativeIdentity.references} tone="muted" />
              {dna.creativeIdentity.styles.length === 0 && (
                <Missing>Aún no me contaste tu estilo visual.</Missing>
              )}
            </div>
            <Group label="Tus colores" show={dna.creativeIdentity.colors.length > 0}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dna.creativeIdentity.colors.map((color) => (
                  <li key={color.hex} className="overflow-hidden rounded-xl border border-line">
                    {/* Color elegido por la persona: es un dato, no un token de la interfaz. */}
                    <div className="h-16" style={{ background: color.hex }} />
                    <div className="bg-elevated px-3 py-2">
                      <p className="truncate text-sm">{color.name ?? '—'}</p>
                      <p className="text-[11px] tabular-nums text-subtle">{color.hex}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Group>
          </div>
        </Section>

        <Section eyebrow="Qué creas" title="Contenido" step={11}>
          <div className="space-y-5">
            <ChipGroup label="Temas" items={dna.contentIdentity.themes} tone="strong" />
            <ChipGroup label="Formatos" items={dna.contentIdentity.preferredFormats} />
            <ChipGroup label="Plataformas" items={dna.contentIdentity.platforms} tone="muted" />
            {dna.contentIdentity.frequencyPreference && (
              <p className="text-sm text-muted">
                Frecuencia:{' '}
                <span className="text-fg">{dna.contentIdentity.frequencyPreference}</span>
              </p>
            )}
          </div>
        </Section>

        <Section eyebrow="Cómo trabajas" title="Forma de trabajar" step={12}>
          {hasWork ? (
            <div className="space-y-5">
              {work.map(([label, items]) => (
                <ChipGroup key={label} label={label} items={items} />
              ))}
            </div>
          ) : (
            <Missing>Aún no me contaste cómo te organizas.</Missing>
          )}
        </Section>

        <Section eyebrow="Tu Pixel" title="En qué te ayudo" step={13} className="lg:col-span-2">
          <Chips items={dna.supportNeeds.wantsHelpWith} tone="strong" />
          {dna.supportNeeds.expectations && (
            <blockquote className="mt-6 border-l-2 border-line-strong pl-5 text-[15px] leading-relaxed text-fg">
              {dna.supportNeeds.expectations}
            </blockquote>
          )}
          {dna.restrictions.length > 0 && (
            <div className="mt-8 rounded-xl border border-line-strong p-5">
              <Label>
                <span
                  className="mr-2 inline-block size-1.5 bg-alert align-middle"
                  aria-hidden="true"
                />
                Pixel nunca
              </Label>
              <BulletList items={dna.restrictions} icon="x" />
            </div>
          )}
        </Section>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <p className="text-sm text-muted">
          Con esto, Pixel ya puede crear tu personaje y conversar contigo.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to={`${base}/pixel`} className={buttonClasses('secondary')}>
            <Icon name="character" className="size-4" /> Mi Pixel
          </Link>
          <Link to={`${base}/chat`} className={buttonClasses('primary')}>
            Hablar con Pixel <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
