import { INSIGHT_TYPE_LABELS, type CampaignStrategy } from '@pixel/contracts';
import type { ReactNode } from 'react';

/**
 * La estrategia como un documento de dirección creativa: la idea arriba, con jerarquía tipográfica
 * y mucho aire; el razonamiento debajo. Nunca un volcado de campos. Un insight sin base en el ADN ni
 * en el brief se presenta como "Hipótesis estratégica", nunca como verdad de mercado.
 */
export function StrategyView({
  strategy,
  versions,
  onVersionChange,
}: {
  strategy: CampaignStrategy;
  versions: number[];
  onVersionChange?: (version: number) => void;
}) {
  const visual = strategy.visualDirection;
  const hypothesis = strategy.insightType === 'strategic_hypothesis';
  const visualBlocks: [string, string[]][] = [
    ['Atmósfera', visual.mood],
    ['Color', visual.colors],
    ['Materiales', visual.materials],
    ['Composición', visual.composition],
    ['Fotografía', visual.photography],
    ['Movimiento', visual.motion],
  ];

  return (
    <article aria-label="Estrategia de campaña" className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-subtle">
          <span>Concepto creativo</span>
          {versions.length > 1 && onVersionChange ? (
            <VersionPicker
              current={strategy.version}
              versions={versions}
              onChange={onVersionChange}
            />
          ) : (
            <span>· Versión {strategy.version}</span>
          )}
          {strategy.generation.mode === 'demo' && <span>· Modo demo</span>}
        </div>
        <h2 className="mt-5 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
          {strategy.concept}
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg">{strategy.bigIdea}</p>
        <div className="mt-10 border-l-2 border-line-strong pl-5">
          <p className="text-xs uppercase tracking-[0.18em] text-subtle">Mensaje principal</p>
          <p className="mt-2 font-display text-xl font-bold">{strategy.keyMessage}</p>
          {strategy.callToAction && (
            <p className="mt-2 text-sm text-muted">Llamada a la acción: {strategy.callToAction}</p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Problema estratégico">
          <p>{strategy.strategicProblem}</p>
        </Block>
        <Block title="Oportunidad">
          <p>{strategy.strategicOpportunity}</p>
        </Block>
        <Block
          title="Insight"
          tag={
            <span
              className={[
                'inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-[11px] font-medium',
                hypothesis ? 'border-line-strong text-fg' : 'border-line text-muted',
              ].join(' ')}
            >
              {hypothesis && <span className="size-1.5 bg-alert" aria-hidden="true" />}
              {INSIGHT_TYPE_LABELS[strategy.insightType]}
            </span>
          }
        >
          <p className="text-fg">{strategy.insight}</p>
          {hypothesis && (
            <p className="mt-3 text-xs text-subtle">
              Es una intuición de Pixel, no un dato de investigación: conviene validarla.
            </p>
          )}
        </Block>
        <Block title="Narrativa">
          <p>{strategy.campaignNarrative}</p>
        </Block>
      </div>

      <Block title="Mensajes secundarios">
        <ul className="space-y-2">
          {strategy.supportingMessages.map((message) => (
            <li key={message} className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 bg-fg" aria-hidden="true" />
              {message}
            </li>
          ))}
        </ul>
        {strategy.valueProposition && (
          <p className="mt-4 text-sm text-muted">Propuesta de valor: {strategy.valueProposition}</p>
        )}
      </Block>

      <div className="grid gap-6 lg:grid-cols-3">
        <Block title="Tono">
          <Chips values={strategy.tone} />
        </Block>
        <Block title="Canales">
          <Chips values={strategy.channels} />
        </Block>
        <Block title="Pilares">
          <ul className="space-y-3">
            {strategy.contentPillars.map((pillar) => (
              <li key={pillar.name}>
                <p className="font-medium text-fg">{pillar.name}</p>
                <p className="text-sm text-muted">{pillar.purpose}</p>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <Block title="Dirección visual">
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visualBlocks
            .filter(([, values]) => values.length > 0)
            .map(([label, values]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</dt>
                <dd className="mt-2 space-y-1 text-sm text-fg">
                  {values.map((value) => (
                    <p key={value}>{value}</p>
                  ))}
                </dd>
              </div>
            ))}
        </dl>
        {visual.avoid.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">Evitar</p>
            <p className="mt-2 text-sm text-muted">{visual.avoid.join(' · ')}</p>
          </div>
        )}
      </Block>

      <Block title="Por qué representa a la marca">
        <p className="text-fg">{strategy.rationale}</p>
        {(strategy.generation.discardedClaims > 0 ||
          strategy.generation.discardedDeliverables > 0) && (
          <p className="mt-3 text-xs text-subtle">
            Pixel descartó{' '}
            {strategy.generation.discardedClaims + strategy.generation.discardedDeliverables}{' '}
            elementos que no se apoyaban en el ADN ni en el brief.
          </p>
        )}
      </Block>
    </article>
  );
}

function Block({ title, tag, children }: { title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">{title}</h3>
        {tag}
      </div>
      <div className="text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Chips({ values }: { values: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((value) => (
        <li key={value} className="rounded-md border border-line px-2.5 py-1 text-sm text-fg">
          {value}
        </li>
      ))}
    </ul>
  );
}

function VersionPicker({
  current,
  versions,
  onChange,
}: {
  current: number;
  versions: number[];
  onChange: (version: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 normal-case tracking-normal">
      <span className="sr-only">Versión de la estrategia</span>
      <select
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-md border border-line bg-canvas px-2 py-0.5 text-xs text-fg"
      >
        {versions.map((version) => (
          <option key={version} value={version}>
            Versión {version}
            {version === versions[versions.length - 1] ? ' (vigente)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
