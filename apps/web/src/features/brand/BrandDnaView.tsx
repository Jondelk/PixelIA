import { BRAND_ARCHETYPES, type BrandDna } from '@pixel/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { PixelMark } from '../../components/PixelMark';
import { DIMENSIONS, PALETTE_ROLE_LABEL, SHAPE_LANGUAGE_LABEL, TEMPERATURE_LABEL } from './labels';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

const rise = (step: number): CSSProperties => ({ animationDelay: `${80 + step * 55}ms` });

function Section({
  title,
  eyebrow,
  step,
  className = '',
  children,
}: {
  title: string;
  eyebrow: string;
  step: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`animate-rise rounded-2xl border border-line bg-surface/80 p-6 ${className}`}
      style={rise(step)}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70">{eyebrow}</p>
      <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Chips({
  items,
  tone = 'default',
}: {
  items: string[];
  tone?: 'default' | 'accent' | 'muted';
}) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  const styles = {
    default: 'border-line-strong text-fg/90',
    accent: 'border-accent/40 bg-accent/[0.07] text-accent-soft',
    muted: 'border-line text-muted',
  }[tone];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-full border px-3 py-1 text-[13px] ${styles}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">{children}</p>
  );
}

function Meter({ level, label }: { level: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-5 rounded-full ${n <= level ? 'bg-accent' : 'bg-elevated'}`}
          />
        ))}
      </div>
      <span className="text-sm text-fg/90">{label}</span>
    </div>
  );
}

function BulletList({ items, icon }: { items: string[]; icon?: 'check' | 'x' }) {
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-fg/90">
          {icon ? (
            <Icon
              name={icon}
              className={`mt-0.5 size-4 shrink-0 ${icon === 'check' ? 'text-accent' : 'text-rose-400'}`}
            />
          ) : (
            <span className="mt-2 size-1 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
          )}
          {item}
        </li>
      ))}
    </ul>
  );
}

/** "Así entiende Pixel tu marca": el BrandDNA presentado como lo que Pixel aprendió. */
export function BrandDnaView({
  dna,
  editHref,
  justLearned,
}: {
  dna: BrandDna;
  editHref: string;
  justLearned: boolean;
}) {
  const primary = BRAND_ARCHETYPES[dna.archetypes.primary.id];
  const secondary = dna.archetypes.secondary ? BRAND_ARCHETYPES[dna.archetypes.secondary.id] : null;
  const { communication: c, visualLanguage: v } = dna;
  const restrictions = [
    ...dna.restrictions.creative,
    ...dna.restrictions.visual.map((item) => `Evitar visualmente: ${item}`),
  ];

  return (
    <div className="space-y-5">
      {/* Encabezado: lo que Pixel aprendió */}
      <header className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-10 sm:px-10 sm:py-14">
        <div
          className="bg-grid pointer-events-none absolute inset-0 opacity-70"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-[100px]"
          style={{ background: v.palette[0]?.hex, opacity: 0.25 }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="animate-rise flex items-center gap-3">
              <PixelMark className="size-9 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                Brand Brain · versión {dna.version}
              </p>
            </div>
            <h1
              className="animate-rise mt-6 font-display text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.05]"
              style={rise(0)}
            >
              Así entiende Pixel tu marca
            </h1>
            <p className="animate-rise mt-4 text-sm text-muted" style={rise(1)}>
              {justLearned
                ? `Listo. Estudié ${dna.identity.name} y esto es lo que aprendí.`
                : `Lo que Pixel sabe de ${dna.identity.name}, aprendido el ${dateFormat.format(new Date(dna.createdAt))}.`}
            </p>
            <blockquote
              className="animate-rise mt-8 border-l-2 border-accent/60 pl-5 font-display text-xl leading-snug text-fg sm:text-2xl"
              style={rise(2)}
            >
              {dna.identity.essence}
            </blockquote>
          </div>
          <Link
            to={editHref}
            className={`${buttonClasses('secondary')} animate-rise shrink-0 self-start lg:self-auto`}
            style={rise(3)}
          >
            Editar respuestas
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Personalidad */}
        <Section eyebrow="Quién es" title="Personalidad" step={3}>
          <ul className="flex flex-wrap gap-1.5">
            {dna.personality.traits.map((trait) => (
              <li
                key={trait.label}
                className="rounded-full border border-accent/40 bg-accent/[0.07] px-3 py-1 text-[13px] text-fg"
                style={{ opacity: 0.55 + trait.weight * 0.45 }}
                title={trait.recognized ? 'Pixel reconoce este rasgo' : 'Rasgo propio de la marca'}
              >
                {trait.label}
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-4">
            {DIMENSIONS.map(({ key, low, high }) => {
              const value = dna.personality.dimensions[key];
              return (
                <div key={key}>
                  <div className="mb-1.5 flex justify-between text-xs text-subtle">
                    <span className={value < 45 ? 'text-fg' : ''}>{low}</span>
                    <span className={value > 55 ? 'text-fg' : ''}>{high}</span>
                  </div>
                  <div
                    className="relative h-1.5 rounded-full bg-elevated"
                    role="meter"
                    aria-label={`${low} a ${high}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={value}
                  >
                    <span
                      className="absolute inset-y-0 left-1/2 w-px bg-line-strong"
                      aria-hidden="true"
                    />
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]"
                      style={{ left: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Arquetipo */}
        <Section eyebrow="Cómo se comporta" title="Arquetipo" step={4}>
          <p className="font-display text-3xl font-semibold tracking-tight text-accent-soft">
            {primary.name}
          </p>
          <p className="mt-1 text-sm italic text-muted">“{primary.motto}”</p>
          <p className="mt-4 text-sm leading-relaxed text-fg/90">{primary.description}</p>
          {dna.archetypes.primary.signals.length > 0 && (
            <p className="mt-3 text-xs text-subtle">
              Lo deduje de: {dna.archetypes.primary.signals.join(', ')}.
            </p>
          )}
          {secondary && (
            <p className="mt-4 text-sm text-muted">
              Con matices de <span className="text-fg">{secondary.name}</span>.
            </p>
          )}
          <ul className="mt-5 space-y-2">
            {dna.archetypes.ranking.map((match) => (
              <li
                key={match.id}
                className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-xs"
              >
                <span className="truncate text-muted">{BRAND_ARCHETYPES[match.id].name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-electric to-accent"
                    style={{ width: `${match.score}%` }}
                  />
                </span>
                <span className="text-right font-mono text-subtle">{match.score}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Tono */}
        <Section eyebrow="Cómo habla" title="Tono" step={5}>
          <Chips items={c.tone} tone="accent" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Formalidad</Label>
              <Meter level={c.formality.level} label={c.formality.label} />
            </div>
            <div>
              <Label>Energía</Label>
              <Meter level={c.energy.level} label={c.energy.label} />
            </div>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Pixel hará</Label>
              <BulletList items={c.guidelines.do} icon="check" />
            </div>
            <div>
              <Label>Pixel evitará</Label>
              <BulletList items={c.guidelines.dont} icon="x" />
            </div>
          </div>
        </Section>

        {/* Público */}
        <Section eyebrow="Para quién" title="Público" step={6}>
          <p className="text-sm leading-relaxed text-fg/90">{dna.audience.summary}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Necesita</Label>
              <BulletList items={dna.audience.needs} />
            </div>
            <div>
              <Label>Le frustra</Label>
              <BulletList items={dna.audience.problems} />
            </div>
          </div>
          <div className="mt-5">
            <Label>Cómo es</Label>
            <Chips items={dna.audience.characteristics} tone="muted" />
          </div>
        </Section>

        {/* Paleta */}
        <Section eyebrow="Cómo se ve" title="Paleta" step={7} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
            {v.palette.map((color) => (
              <div key={color.hex} className="overflow-hidden rounded-xl border border-line">
                <div
                  className="flex h-24 items-end p-3 font-mono text-xs"
                  style={{
                    background: color.hex,
                    color: color.luminance > 0.45 ? '#0b0f19' : '#f5f7fb',
                  }}
                >
                  {color.hex}
                </div>
                <div className="bg-elevated/70 px-3 py-2.5">
                  <p className="truncate text-sm">{color.name ?? '—'}</p>
                  <p className="text-xs text-subtle">
                    {PALETTE_ROLE_LABEL[color.role]} ·{' '}
                    {TEMPERATURE_LABEL[color.temperature].toLowerCase()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Paleta de temperatura{' '}
            <span className="text-fg">{TEMPERATURE_LABEL[v.temperature].toLowerCase()}</span>.
          </p>
        </Section>

        {/* Estilo visual */}
        <Section eyebrow="Cómo se ve" title="Estilo visual" step={8}>
          <p className="text-sm text-muted">
            Lenguaje de formas{' '}
            <span className="font-medium text-accent-soft">
              {SHAPE_LANGUAGE_LABEL[v.shapeLanguage].toLowerCase()}
            </span>
          </p>
          <div className="mt-5 space-y-5">
            <div>
              <Label>Estilo</Label>
              <Chips items={v.styles} tone="accent" />
            </div>
            <div>
              <Label>Formas</Label>
              <Chips items={v.shapes} />
            </div>
            <div>
              <Label>Materiales</Label>
              <Chips items={v.materials} tone="muted" />
            </div>
            <div>
              <Label>Elementos recurrentes</Label>
              <Chips items={v.recurringElements} tone="muted" />
            </div>
          </div>
        </Section>

        {/* Diferenciadores */}
        <Section eyebrow="Por qué la eligen" title="Diferenciadores" step={9}>
          <ol className="space-y-3">
            {dna.differentiators.statements.map((statement, i) => (
              <li key={statement} className="flex gap-3 text-sm leading-relaxed text-fg/90">
                <span className="font-mono text-xs text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {statement}
              </li>
            ))}
          </ol>
          {dna.differentiators.competitors.length > 0 && (
            <div className="mt-5">
              <Label>Frente a</Label>
              <Chips items={dna.differentiators.competitors} tone="muted" />
            </div>
          )}
        </Section>

        {/* Preferencias creativas */}
        <Section
          eyebrow="Su criterio"
          title="Preferencias creativas"
          step={10}
          className="lg:col-span-2"
        >
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <Label>Le gusta</Label>
              <BulletList items={dna.creativePreferences.likes} icon="check" />
            </div>
            <div>
              <Label>No le gusta</Label>
              <BulletList items={dna.creativePreferences.dislikes} icon="x" />
            </div>
            <div>
              <Label>Referencias</Label>
              <Chips
                items={[...dna.creativePreferences.visualReferences, ...v.references]}
                tone="muted"
              />
            </div>
          </div>
          {restrictions.length > 0 && (
            <div className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
              <Label>Pixel nunca</Label>
              <BulletList items={restrictions} icon="x" />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
