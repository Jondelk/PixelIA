import {
  ANIMATION_PERSONALITY_LABELS,
  AVATAR_TYPE_LABELS,
  BRAND_ARCHETYPES,
  type AvatarProfile,
  type BrandDna,
} from '@pixel/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { PixelPreview } from '../pixel/PixelPreview';
import { EYES_LABEL, FACE_STYLE_LABEL, FINISH_LABEL, MOUTH_LABEL } from '../pixel/labels';
import {
  DIMENSIONS,
  PALETTE_ROLE_LABEL,
  SHAPE_LANGUAGE_LABEL,
  TEMPERATURE_LABEL,
} from '../brand/labels';
import {
  chooseTypography,
  contrastRatio,
  initials,
  INK,
  manualColors,
  MANUAL_SECTIONS,
  PAPER,
  paletteSwatches,
  ROLE_USAGE,
  TYPE_SCALE,
} from './manualModel';

/** Renders de estudio del personaje (URLs listas para <img>), o null si no hay modelo. */
export interface ManualRenders {
  hero: string | null;
  front: string | null;
  threeQuarter: string | null;
  side: string | null;
  cutout: string | null;
}

type SectionId = (typeof MANUAL_SECTIONS)[number]['id'];

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long' });

/**
 * Manual de marca generado a partir del BrandDNA y del personaje. Componente de presentación
 * puro: recibe los datos y dibuja las páginas (ver manual.css).
 */
export function BrandManual({
  dna,
  avatar,
  renders,
  generatedAt,
}: {
  dna: BrandDna;
  avatar: AvatarProfile | null;
  renders: ManualRenders | null;
  generatedAt: Date;
}) {
  const colors = manualColors(dna.visualLanguage.palette);
  const typography = chooseTypography(dna);
  const { display, text } = typography.pairing;
  const name = dna.identity.name;
  const sections = MANUAL_SECTIONS.filter(
    (section) => avatar || !['personaje', 'construccion', 'usos'].includes(section.id),
  );
  const number = (id: SectionId) =>
    String(sections.findIndex((section) => section.id === id) + 1).padStart(2, '0');

  // Versiones de los colores aptas para texto sobre papel (si el color es muy claro, tinta).
  const textSafe = (hex: string) => (contrastRatio(hex, PAPER) >= 3 ? hex : INK);
  const style = {
    '--m-display': `'${display.family}'`,
    '--m-text': `'${text.family}'`,
    '--m-display-weight': display.weight,
    '--m-primary': colors.primary,
    '--m-on-primary': colors.onPrimary,
    '--m-secondary': colors.secondary,
    '--m-on-secondary': colors.onSecondary,
    '--m-accent': colors.accent,
    '--m-primary-text': textSafe(colors.primary),
    '--m-accent-text': textSafe(colors.accent),
  } as CSSProperties;

  let page = 0;
  const folio = (section?: string) => {
    page += 1;
    return (
      <footer className="m-folio">
        <span>
          {name} · Manual de marca{section ? ` · ${section}` : ''}
        </span>
        <span>{String(page).padStart(2, '0')}</span>
      </footer>
    );
  };

  const character = (
    view: keyof ManualRenders,
    alt: string,
    extra?: { style?: CSSProperties; className?: string },
  ) => <CharacterImage avatar={avatar} src={renders?.[view] ?? null} alt={alt} {...extra} />;

  const swatches = paletteSwatches(dna.visualLanguage.palette, PALETTE_ROLE_LABEL);
  const primaryArchetype = BRAND_ARCHETYPES[dna.archetypes.primary.id];
  const secondaryArchetype = dna.archetypes.secondary
    ? BRAND_ARCHETYPES[dna.archetypes.secondary.id]
    : null;
  const c = dna.communication;

  return (
    <div className="manual-doc" style={style}>
      {/* ---------------------------------------------------------------- portada */}
      <section className="mpage mpage--bleed mpage--color" aria-label="Portada">
        <div className="m-split" style={{ gridTemplateColumns: '52fr 48fr', gap: 0 }}>
          <div style={{ padding: '6cqw 5cqw 6cqw 6cqw', display: 'flex', flexDirection: 'column' }}>
            <p className="m-eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>
              Manual de marca
            </p>
            <h1 className="m-display" style={{ margin: 'auto 0 0', fontSize: '7.4cqw' }}>
              {name}
            </h1>
            <p className="m-lead" style={{ color: 'inherit', opacity: 0.85, maxWidth: '40cqw' }}>
              {dna.identity.essence}
            </p>
          </div>
          <div
            style={{
              background: 'var(--m-secondary)',
              display: 'grid',
              placeItems: 'center',
              padding: '4cqw',
            }}
          >
            {avatar ? (
              character('cutout', `${avatar.name}, personaje de ${name}`, {
                style: { width: '100%', height: '100%', background: 'transparent' },
              })
            ) : (
              <span
                className="m-display"
                style={{ fontSize: '16cqw', color: 'var(--m-on-secondary)' }}
                aria-hidden="true"
              >
                {initials(name)}
              </span>
            )}
          </div>
        </div>
        <footer className="m-folio" style={{ right: '50%' }}>
          <span>
            ADN v{dna.version} · {dateFormat.format(generatedAt)}
          </span>
          <span>Pixel</span>
        </footer>
      </section>

      {/* ---------------------------------------------------------------- índice */}
      <section className="mpage" aria-label="Contenido">
        <div className="m-split">
          <div>
            <p className="m-eyebrow">Contenido</p>
            <h2 className="m-display m-title">Cómo usar este manual</h2>
            <p className="m-lead">
              Aquí está lo que {name} es y cómo se ve, se mueve y se expresa. Úsalo como referencia
              para cualquier pieza: redes, empaques, presentaciones o campañas.
            </p>
            <p className="m-body m-mt">
              Pixel lo generó a partir del ADN de la marca: cada decisión de color, tipografía y
              personaje tiene una razón que puedes rastrear hasta él. Si el ADN cambia, el manual se
              actualiza.
            </p>
          </div>
          <ol className="m-list" style={{ columns: 2, columnGap: '4cqw', listStyle: 'none' }}>
            {sections.map((section, index) => (
              <li
                key={section.id}
                style={{
                  breakInside: 'avoid',
                  paddingLeft: 0,
                  padding: '1.1cqw 0',
                  borderBottom: '0.1cqw solid var(--m-rule)',
                  display: 'flex',
                  gap: '1.6cqw',
                  fontSize: '1.45cqw',
                  color: 'var(--m-ink)',
                }}
              >
                <span style={{ color: 'var(--m-primary-text)', fontWeight: 700 }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {section.title}
              </li>
            ))}
          </ol>
        </div>
        {folio()}
      </section>

      {/* ---------------------------------------------------------------- esencia */}
      <section className="mpage" aria-label="Esencia">
        <div className="m-split">
          <div>
            <Eyebrow n={number('esencia')}>Esencia</Eyebrow>
            <h2 className="m-display m-title">Quiénes somos</h2>
            <blockquote className="m-display m-quote m-mt">{dna.identity.essence}</blockquote>
          </div>
          <div className="m-grid" style={{ alignContent: 'start' }}>
            <div className="m-card m-card--accent">
              <p className="m-label">Qué hacemos</p>
              <p className="m-body">{dna.identity.description}</p>
            </div>
            <div className="m-card">
              <p className="m-label">Nuestra historia</p>
              <p className="m-body">{dna.identity.story}</p>
            </div>
            <div className="m-grid m-cols-2">
              <div className="m-card">
                <p className="m-label">Sector</p>
                <p className="m-body">{dna.identity.industry}</p>
              </div>
              {dna.identity.origin && (
                <div className="m-card">
                  <p className="m-label">Origen</p>
                  <p className="m-body">{dna.identity.origin}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        {folio('Esencia')}
      </section>

      {/* ---------------------------------------------------------------- propósito */}
      <section className="mpage" aria-label="Propósito y valores">
        <Eyebrow n={number('proposito')}>Propósito y valores</Eyebrow>
        <h2 className="m-display m-title">Por qué existimos</h2>
        <p className="m-lead">{dna.purpose.purpose}</p>
        <div className="m-grid m-cols-2 m-mt">
          <div className="m-card m-card--accent">
            <p className="m-label">Misión</p>
            <p className="m-body">{dna.purpose.mission}</p>
          </div>
          <div className="m-card">
            <p className="m-label">Visión</p>
            <p className="m-body">{dna.purpose.vision}</p>
          </div>
        </div>
        <p className="m-label m-mt">Valores</p>
        <ul className="m-grid m-cols-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {dna.purpose.values.slice(0, 8).map((value) => (
            <li
              key={value}
              className="m-display"
              style={{
                fontSize: '1.9cqw',
                borderLeft: '0.4cqw solid var(--m-primary)',
                paddingLeft: '1.2cqw',
              }}
            >
              {value}
            </li>
          ))}
        </ul>
        {folio('Propósito')}
      </section>

      {/* ---------------------------------------------------------------- audiencia */}
      <section className="mpage" aria-label="Audiencia">
        <Eyebrow n={number('audiencia')}>Audiencia</Eyebrow>
        <h2 className="m-display m-title">Para quién hablamos</h2>
        <p className="m-lead">{dna.audience.summary}</p>
        <div className="m-grid m-cols-3 m-mt">
          <ListCard title="Lo que necesitan" items={dna.audience.needs} accent />
          <ListCard title="Lo que les preocupa" items={dna.audience.problems} />
          <ListCard title="Cómo son" items={dna.audience.characteristics} />
        </div>
        {folio('Audiencia')}
      </section>

      {/* ---------------------------------------------------------------- personalidad */}
      <section className="mpage" aria-label="Personalidad">
        <div className="m-split">
          <div>
            <Eyebrow n={number('personalidad')}>Personalidad</Eyebrow>
            <h2 className="m-display m-title">Cómo somos</h2>
            <ul className="m-chips m-chips--strong m-mt">
              {dna.personality.traits.slice(0, 8).map((trait) => (
                <li key={trait.label}>{trait.label}</li>
              ))}
            </ul>
            <div className="m-mt">
              {DIMENSIONS.map((dim) => (
                <div key={dim.key} className="m-meter">
                  <span>{dim.low}</span>
                  <span className="m-meter__track">
                    <span
                      className="m-meter__dot"
                      style={{ left: `${dna.personality.dimensions[dim.key]}%` }}
                    />
                  </span>
                  <span>{dim.high}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="m-label">Arquetipo principal</p>
            <p className="m-display" style={{ fontSize: '4.6cqw', margin: 0 }}>
              {primaryArchetype.name}
            </p>
            <p className="m-display" style={{ fontSize: '1.7cqw', marginTop: '0.8cqw' }}>
              «{primaryArchetype.motto}»
            </p>
            <p className="m-body m-mt-sm">{primaryArchetype.description}</p>
            {dna.archetypes.primary.signals.length > 0 && (
              <p className="m-body m-mt-sm" style={{ fontSize: '1cqw' }}>
                Lo vemos en: {dna.archetypes.primary.signals.join(', ')}.
              </p>
            )}
            {secondaryArchetype && (
              <div className="m-card m-mt">
                <p className="m-label">Arquetipo secundario</p>
                <h3 className="m-display">{secondaryArchetype.name}</h3>
                <p className="m-body">{secondaryArchetype.description}</p>
              </div>
            )}
          </div>
        </div>
        {folio('Personalidad')}
      </section>

      {/* ---------------------------------------------------------------- voz */}
      <section className="mpage" aria-label="Voz y tono">
        <Eyebrow n={number('voz')}>Voz y tono</Eyebrow>
        <h2 className="m-display m-title">Cómo hablamos</h2>
        <p className="m-lead">
          Nuestro tono es {joinEs(c.tone.map((t) => t.toLocaleLowerCase('es')))}. Escribimos en{' '}
          {c.language.name.toLocaleLowerCase('es')}.
        </p>
        <div className="m-grid m-cols-3 m-mt">
          <div>
            <p className="m-label">Formalidad · {c.formality.label}</p>
            <Steps level={c.formality.level} />
            <p className="m-label m-mt-sm">Energía · {c.energy.label}</p>
            <Steps level={c.energy.level} />
            <p className="m-label m-mt">Decimos</p>
            <ul className="m-chips">
              {c.vocabulary.preferred.slice(0, 10).map((word) => (
                <li key={word}>{word}</li>
              ))}
            </ul>
            <p className="m-label m-mt-sm">Evitamos decir</p>
            <ul className="m-chips m-chips--avoid">
              {c.vocabulary.avoid.slice(0, 10).map((word) => (
                <li key={word}>{word}</li>
              ))}
            </ul>
          </div>
          <ListCard title="Sí hacemos" items={c.guidelines.do} accent />
          <ListCard title="No hacemos" items={c.guidelines.dont} negative />
        </div>
        {folio('Voz y tono')}
      </section>

      {/* ---------------------------------------------------------------- color */}
      <section className="mpage" aria-label="Color">
        <Eyebrow n={number('color')}>Color</Eyebrow>
        <h2 className="m-display m-title">Paleta de marca</h2>
        <div
          className="m-grid m-mt-sm"
          style={{ gridTemplateColumns: `repeat(${Math.min(5, swatches.length)}, minmax(0, 1fr))` }}
        >
          {swatches.slice(0, 5).map((swatch) => (
            <div key={swatch.hex} className="m-swatch">
              <div
                className="m-swatch__chip"
                style={{ background: swatch.hex, color: swatch.textColor }}
              >
                <span
                  style={{
                    fontSize: '0.86cqw',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {PALETTE_ROLE_LABEL[swatch.role]} · {swatch.share}%
                </span>
                <span className="m-display" style={{ fontSize: '1.7cqw' }}>
                  {swatch.name}
                </span>
              </div>
              <dl className="m-swatch__data">
                <dt>HEX</dt>
                <dd>{swatch.hex}</dd>
                <dt>RGB</dt>
                <dd>{swatch.rgb}</dd>
                <dt>CMYK</dt>
                <dd>{swatch.cmyk}</dd>
                <dt>Texto</dt>
                <dd>
                  <span className="m-grade">{swatch.onPaper.grade}</span> sobre blanco
                </dd>
              </dl>
            </div>
          ))}
        </div>
        <p className="m-label m-mt-sm">Proporción de uso</p>
        <div className="m-share" aria-hidden="true">
          {swatches.map((swatch) => (
            <span key={swatch.hex} style={{ flex: swatch.share, background: swatch.hex }} />
          ))}
        </div>
        <div className="m-grid m-cols-3 m-mt-sm" style={{ fontSize: '1cqw' }}>
          {[...new Set(swatches.map((s) => s.role))].slice(0, 3).map((role) => (
            <p key={role} className="m-body">
              <b style={{ color: 'var(--m-ink)' }}>{PALETTE_ROLE_LABEL[role]}.</b>{' '}
              {ROLE_USAGE[role]}
            </p>
          ))}
        </div>
        {folio('Color')}
      </section>

      {/* ---------------------------------------------------------------- tipografía */}
      <section className="mpage" aria-label="Tipografía">
        <div className="m-split" style={{ gridTemplateColumns: '50fr 50fr' }}>
          <div>
            <Eyebrow n={number('tipografia')}>Tipografía</Eyebrow>
            <h2 className="m-display m-title">Nuestras letras</h2>
            <p className="m-lead" style={{ fontSize: '1.4cqw' }}>
              Una combinación {typography.pairing.mood}. Elegida por:{' '}
              {joinEs(typography.reasons).toLocaleLowerCase('es')}.
            </p>
            <div className="m-card m-card--accent m-mt">
              <p className="m-label">Títulos · {display.family}</p>
              <p className="m-display" style={{ fontSize: '9cqw', margin: 0, lineHeight: 1 }}>
                Aa
              </p>
              <p className="m-display" style={{ fontSize: '1.6cqw', margin: '0.6cqw 0 0' }}>
                ABCDEFGHIJKLMNÑOPQRSTUVWXYZ
                <br />
                abcdefghijklmnñopqrstuvwxyz 0123456789
              </p>
            </div>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <div className="m-card">
              <p className="m-label">Textos · {text.family}</p>
              <p className="m-body" style={{ fontSize: '1.3cqw' }}>
                {dna.identity.description} {dna.purpose.mission}
              </p>
            </div>
            <div className="m-mt">
              {TYPE_SCALE.map((step) => (
                <div
                  key={step.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '10cqw 1fr',
                    alignItems: 'baseline',
                    borderTop: '0.1cqw solid var(--m-rule)',
                    padding: '0.6cqw 0',
                  }}
                >
                  <span style={{ fontSize: '0.9cqw', color: 'var(--m-ink-faint)' }}>
                    {step.label} · {step.size} pt
                  </span>
                  <span
                    className={step.role === 'display' ? 'm-display' : undefined}
                    style={{
                      fontSize: `${step.size * 0.075}cqw`,
                      lineHeight: step.lineHeight,
                      fontWeight: step.role === 'text-strong' ? 600 : undefined,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.role === 'display' ? name : 'Así suena nuestra marca por escrito'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {folio('Tipografía')}
      </section>

      {/* ---------------------------------------------------------------- lenguaje visual */}
      <section className="mpage" aria-label="Lenguaje visual">
        <Eyebrow n={number('lenguaje-visual')}>Lenguaje visual</Eyebrow>
        <h2 className="m-display m-title">Cómo nos vemos</h2>
        <p className="m-lead">
          Una estética de temperatura{' '}
          {TEMPERATURE_LABEL[dna.visualLanguage.temperature].toLowerCase()} y formas de lenguaje{' '}
          {SHAPE_LANGUAGE_LABEL[dna.visualLanguage.shapeLanguage].toLowerCase()}.
        </p>
        <div className="m-grid m-cols-3 m-mt">
          <ChipCard title="Estilos" items={dna.visualLanguage.styles} accent />
          <ChipCard title="Materiales y texturas" items={dna.visualLanguage.materials} />
          <ChipCard title="Formas" items={dna.visualLanguage.shapes} />
          <ChipCard title="Elementos recurrentes" items={dna.visualLanguage.recurringElements} />
          <ChipCard
            title="Referencias"
            items={[...dna.visualLanguage.references, ...dna.creativePreferences.visualReferences]}
          />
          <ChipCard title="Nos gusta" items={dna.creativePreferences.likes} />
        </div>
        {folio('Lenguaje visual')}
      </section>

      {avatar && (
        <>
          {/* ---------------------------------------------------------------- personaje */}
          <section className="mpage mpage--bleed" aria-label="El personaje">
            <div className="m-split" style={{ gridTemplateColumns: '54fr 46fr', gap: 0 }}>
              <figure className="m-figure" style={{ margin: 0, height: '100%', borderRadius: 0 }}>
                {character('hero', `${avatar.name} en su render principal`)}
              </figure>
              <div style={{ padding: '5.2cqw 6cqw 7cqw 4.4cqw' }}>
                <Eyebrow n={number('personaje')}>El personaje</Eyebrow>
                <h2 className="m-display m-title" style={{ fontSize: '4.6cqw' }}>
                  {avatar.name}
                </h2>
                <p className="m-label m-mt-sm">{AVATAR_TYPE_LABELS[avatar.avatarType]}</p>
                <p className="m-body m-clamp" style={{ fontSize: '1.25cqw', WebkitLineClamp: 4 }}>
                  {avatar.concept}
                </p>
                <div className="m-card m-card--accent m-mt-sm">
                  <p className="m-label">Por qué nos representa</p>
                  <p className="m-body m-clamp" style={{ fontSize: '1.05cqw', WebkitLineClamp: 6 }}>
                    {avatar.rationale.summary}
                  </p>
                </div>
                <p className="m-label m-mt-sm">Personalidad</p>
                <ul className="m-chips m-chips--strong">
                  {avatar.personalityTraits.map((trait) => (
                    <li key={trait}>{trait}</li>
                  ))}
                </ul>
                <p
                  className="m-body m-mt-sm m-clamp"
                  style={{ fontSize: '1cqw', WebkitLineClamp: 3 }}
                >
                  Se mueve de forma{' '}
                  {ANIMATION_PERSONALITY_LABELS[avatar.animationPersonality].toLowerCase()}.{' '}
                  {avatar.idleBehavior.description}
                </p>
              </div>
            </div>
            <footer className="m-folio" style={{ left: '58cqw' }}>
              <span>El personaje</span>
              <span>{String((page += 1)).padStart(2, '0')}</span>
            </footer>
          </section>

          {/* ---------------------------------------------------------------- construcción */}
          <section className="mpage" aria-label="Construcción del personaje">
            <Eyebrow n={number('construccion')}>Construcción del personaje</Eyebrow>
            <h2 className="m-display m-title" style={{ fontSize: '3.2cqw' }}>
              Vistas, color y acabados
            </h2>
            <div className="m-grid m-cols-3 m-mt-sm">
              {(
                [
                  ['front', 'Frente'],
                  ['threeQuarter', 'Tres cuartos'],
                  ['side', 'Perfil'],
                ] as const
              ).map(([view, label]) => (
                <figure key={view} className="m-figure" style={{ aspectRatio: '1', margin: 0 }}>
                  {character(view, `${avatar.name}: vista ${label.toLowerCase()}`)}
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
            <div className="m-grid m-cols-4 m-mt-sm" style={{ fontSize: '1cqw' }}>
              <div>
                <p className="m-label">Color</p>
                {[avatar.primaryColor, avatar.secondaryColor, avatar.accentColor].map((color) => (
                  <p
                    key={color.hex}
                    className="m-body"
                    style={{ display: 'flex', gap: '0.8cqw', alignItems: 'center' }}
                  >
                    <span
                      style={{
                        width: '1.6cqw',
                        height: '1.6cqw',
                        borderRadius: '50%',
                        background: color.hex,
                        border: '0.1cqw solid var(--m-rule)',
                        flexShrink: 0,
                      }}
                    />
                    {color.name} · {color.hex.toUpperCase()}
                  </p>
                ))}
              </div>
              <div>
                <p className="m-label">Acabado</p>
                <p className="m-body">
                  {FINISH_LABEL[avatar.renderHints.finish]} · {avatar.materials.join(', ')}
                </p>
              </div>
              <div>
                <p className="m-label">Rostro</p>
                <p className="m-body">
                  {FACE_STYLE_LABEL[avatar.faceStyle]}: ojos {EYES_LABEL[avatar.eyesStyle]},{' '}
                  {MOUTH_LABEL[avatar.mouthStyle].toLowerCase()}.
                </p>
              </div>
              <div>
                <p className="m-label">Decisiones clave</p>
                <ul className="m-list" style={{ fontSize: '0.95cqw' }}>
                  {avatar.rationale.decisions.slice(0, 3).map((decision) => (
                    <li key={decision.attribute}>{decision.reason}</li>
                  ))}
                </ul>
              </div>
            </div>
            {folio('Construcción')}
          </section>

          {/* ---------------------------------------------------------------- usos */}
          <section className="mpage" aria-label="Usos del personaje">
            <Eyebrow n={number('usos')}>Usos del personaje</Eyebrow>
            <h2 className="m-display m-title" style={{ fontSize: '3.2cqw' }}>
              Así sí, así no
            </h2>
            <div className="m-grid m-cols-4 m-mt-sm" style={{ gap: '1.6cqw' }}>
              <Use ok label="Sobre blanco" background={PAPER}>
                {character('cutout', 'Uso correcto sobre blanco')}
              </Use>
              <Use ok label="Sobre el color principal" background={colors.primary}>
                {character('cutout', 'Uso correcto sobre el color principal')}
              </Use>
              <Use ok label="Sobre el secundario" background={colors.secondary}>
                {character('cutout', 'Uso correcto sobre el color secundario')}
              </Use>
              <Use ok label="Con aire alrededor" background={colors.neutral}>
                {character('cutout', 'Uso correcto con espacio', { style: { height: '58%' } })}
              </Use>
              <Use
                label="No lo deformes"
                background={PAPER}
                note="Nunca estirar ni aplastar sus proporciones."
              >
                {character('cutout', 'Uso incorrecto: deformado', {
                  style: { transform: 'scaleX(1.45)' },
                })}
              </Use>
              <Use
                label="No cambies sus colores"
                background={PAPER}
                note="Sus colores salen de la paleta de la marca."
              >
                {character('cutout', 'Uso incorrecto: recoloreado', {
                  style: { filter: 'hue-rotate(150deg) saturate(1.6)' },
                })}
              </Use>
              <Use
                label="No lo pierdas en el fondo"
                background={avatar.primaryColor.hex}
                note="Evita fondos de su mismo color."
              >
                {character('cutout', 'Uso incorrecto: sin contraste', {
                  style: { opacity: 0.55 },
                })}
              </Use>
              <Use
                label="No lo gires ni lo cortes"
                background={PAPER}
                note="Siempre completo y de pie."
              >
                {character('cutout', 'Uso incorrecto: girado y cortado', {
                  style: { transform: 'rotate(28deg) translate(20%, 22%) scale(1.35)' },
                })}
              </Use>
            </div>
            {folio('Usos')}
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- aplicaciones */}
      <section className="mpage" aria-label="Aplicaciones">
        <Eyebrow n={number('aplicaciones')}>Aplicaciones</Eyebrow>
        <h2 className="m-display m-title" style={{ fontSize: '3.2cqw' }}>
          La marca en acción
        </h2>
        <div
          className="m-grid m-mt"
          style={{ gridTemplateColumns: '1fr 1fr 0.82fr', alignItems: 'start' }}
        >
          <div>
            <div
              className="m-card-mock"
              style={{ background: colors.primary, color: colors.onPrimary, padding: '2cqw' }}
            >
              <p className="m-display" style={{ margin: 0, fontSize: '2.2cqw' }}>
                {name}
              </p>
              <p
                style={{
                  margin: '0.4cqw 0 0',
                  fontSize: '0.95cqw',
                  opacity: 0.85,
                  maxWidth: '60%',
                }}
              >
                {dna.identity.essence}
              </p>
              {avatar && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-2%',
                    bottom: '-6%',
                    width: '46%',
                    height: '86%',
                  }}
                >
                  {character('cutout', '', {
                    style: { background: 'transparent', width: '100%', height: '100%' },
                  })}
                </div>
              )}
            </div>
            <p className="m-label m-mt-sm">Tarjeta · frente</p>
          </div>
          <div>
            <div
              className="m-card-mock"
              style={{ background: PAPER, border: '0.1cqw solid var(--m-rule)', padding: '2cqw' }}
            >
              <span
                className="m-display"
                style={{
                  position: 'absolute',
                  right: '2cqw',
                  top: '1.6cqw',
                  fontSize: '2.4cqw',
                  color: 'var(--m-primary-text)',
                }}
              >
                {initials(name)}
              </span>
              <p style={{ margin: '5.4cqw 0 0', fontWeight: 600, fontSize: '1.2cqw' }}>
                Nombre Apellido
              </p>
              <p style={{ margin: '0.2cqw 0 0', fontSize: '0.95cqw', color: 'var(--m-ink-soft)' }}>
                Cargo
              </p>
              <p style={{ margin: '1cqw 0 0', fontSize: '0.9cqw', color: 'var(--m-ink-soft)' }}>
                correo@{slugDomain(name)} · +57 000 000 0000
              </p>
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: '0.8cqw',
                  background: colors.accent,
                }}
              />
            </div>
            <p className="m-label m-mt-sm">Tarjeta · reverso</p>
          </div>
          <div>
            <div
              className="m-post-mock"
              style={{ background: colors.secondary, color: colors.onSecondary, padding: '2cqw' }}
            >
              <p
                className="m-display"
                style={{
                  margin: 0,
                  fontSize: '2cqw',
                  maxWidth: '75%',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {dna.purpose.values[0] ?? dna.identity.essence}
              </p>
              {avatar && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-4%',
                    bottom: '-4%',
                    width: '70%',
                    height: '72%',
                  }}
                >
                  {character('cutout', '', {
                    style: { background: 'transparent', width: '100%', height: '100%' },
                  })}
                </div>
              )}
              <span
                style={{
                  position: 'absolute',
                  left: '2cqw',
                  bottom: '1.6cqw',
                  fontSize: '0.9cqw',
                  fontWeight: 600,
                }}
              >
                {name}
              </span>
            </div>
            <p className="m-label m-mt-sm">Publicación para redes</p>
          </div>
        </div>
        {folio('Aplicaciones')}
      </section>

      {/* ---------------------------------------------------------------- límites */}
      <section className="mpage" aria-label="Lo que la marca no hace">
        <Eyebrow n={number('limites')}>Lo que la marca no hace</Eyebrow>
        <h2 className="m-display m-title">Nuestros límites</h2>
        <div className="m-grid m-cols-3 m-mt">
          <ListCard
            title="En lo creativo"
            items={unique([...dna.restrictions.creative, ...dna.creativePreferences.dislikes])}
            negative
          />
          <ListCard
            title="En las palabras"
            items={unique([...dna.restrictions.words, ...c.vocabulary.avoid])}
            negative
          />
          <ListCard
            title="En lo visual"
            items={unique([...dna.restrictions.visual, ...(avatar?.avoid ?? [])])}
            negative
          />
        </div>
        <div className="m-grid m-cols-2 m-mt">
          <ListCard title="Lo que nos diferencia" items={dna.differentiators.statements} accent />
          <ChipCard title="Con quién nos comparan" items={dna.differentiators.competitors} />
        </div>
        {folio('Límites')}
      </section>

      {/* ---------------------------------------------------------------- contraportada */}
      <section className="mpage mpage--color" aria-label="Contraportada">
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <p className="m-display" style={{ fontSize: '6cqw', margin: 0 }}>
              {name}
            </p>
            <p
              style={{
                margin: '1.6cqw auto 0',
                maxWidth: '54cqw',
                fontSize: '1.2cqw',
                opacity: 0.85,
              }}
            >
              Manual generado por Pixel a partir del ADN de marca (versión {dna.version}) el{' '}
              {dateFormat.format(generatedAt)}. Se actualiza cuando cambian el ADN o el personaje.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- piezas

function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="m-eyebrow">
      <b>{n}</b>
      {children}
    </p>
  );
}

function Steps({ level }: { level: number }) {
  return (
    <span className="m-steps" aria-label={`${level} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}

function ListCard({
  title,
  items,
  accent = false,
  negative = false,
}: {
  title: string;
  items: string[];
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`m-card${accent ? ' m-card--accent' : ''}`}>
      <p className="m-label">{title}</p>
      {items.length ? (
        <ul className={`m-list${negative ? ' m-list--no' : ''}`}>
          {items.slice(0, 7).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="m-body">—</p>
      )}
    </div>
  );
}

function ChipCard({
  title,
  items,
  accent = false,
}: {
  title: string;
  items: string[];
  accent?: boolean;
}) {
  const list = unique(items);
  return (
    <div className={`m-card${accent ? ' m-card--accent' : ''}`}>
      <p className="m-label">{title}</p>
      {list.length ? (
        <ul className="m-chips">
          {list.slice(0, 10).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="m-body">—</p>
      )}
    </div>
  );
}

function Use({
  ok = false,
  label,
  note,
  background,
  children,
}: {
  ok?: boolean;
  label: string;
  note?: string;
  background: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={`m-use${ok ? '' : ' m-use--wrong'}`}
      style={{ background, margin: 0, border: '0.1cqw solid var(--m-rule)' }}
    >
      {children}
      <span className="m-use__tag">
        <i aria-hidden="true">{ok ? '✓' : '✕'}</i>
        {label}
      </span>
      {note && <p style={{ color: contrastRatio(background, INK) >= 4.5 ? INK : PAPER }}>{note}</p>}
    </figure>
  );
}

/** Render de estudio si existe; si no, la vista 2D del concepto. */
function CharacterImage({
  avatar,
  src,
  alt,
  style,
  className = '',
}: {
  avatar: AvatarProfile | null;
  src: string | null;
  alt: string;
  style?: CSSProperties;
  className?: string;
}) {
  if (src) return <img src={src} alt={alt} style={style} className={className} />;
  if (!avatar) return null;
  return (
    <div style={{ display: 'grid', placeItems: 'center', ...style }} className={className}>
      <PixelPreview profile={avatar} className="h-full w-full" />
    </div>
  );
}

// ---------------------------------------------------------------- texto

function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLocaleLowerCase('es');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "Café Tinto" → "cafetinto.com" (solo para la maqueta de la tarjeta). */
function slugDomain(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `${slug || 'marca'}.com`;
}
