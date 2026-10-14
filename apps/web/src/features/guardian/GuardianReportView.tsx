import {
  GUARDIAN_DIMENSION_LABELS,
  GUARDIAN_RESOURCE_LABELS,
  GUARDIAN_SEVERITY_LABELS,
  type GuardianFinding,
  type GuardianReport,
} from '@pixel/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { canApply, canCorrect, sortFindings, STATUS_HEADLINE } from './guardianLogic';

export interface GuardianReportActions {
  onOverride?: (findingId: string) => void;
  onCorrect?: () => void;
  onApply?: () => void;
  onReviewAgain?: () => void;
  busy?: boolean;
}

/**
 * Un informe del Brand Guardian: estado, score explicado (siempre con dimensiones y hallazgos),
 * hallazgos con evidencia y recomendación, y la corrección propuesta para comparar antes de
 * aplicarla. Nada de esto modifica el recurso por sí solo.
 */
export function GuardianReportView({
  report,
  actions = {},
}: {
  report: GuardianReport;
  actions?: GuardianReportActions;
}) {
  const dimensions = report.dimensions.filter((entry) => entry.applicable);
  const findings = sortFindings(report.findings);
  return (
    <article aria-label="Informe del Brand Guardian" className="space-y-8">
      <header className="rounded-2xl border border-line-strong bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              {GUARDIAN_RESOURCE_LABELS[report.resourceType]} · {report.resourceLabel}
            </p>
            <h2 className="mt-3 flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
              <StatusMark status={report.status} />
              {STATUS_HEADLINE[report.status]}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">{report.summary}</p>
          </div>
          {report.score !== null && (
            <div className="text-right">
              <p className="font-display text-4xl font-bold tracking-tight">
                {report.score}
                <span className="text-lg text-subtle"> / 100</span>
              </p>
              <p className="mt-1 max-w-[14rem] text-xs leading-snug text-subtle">
                Resultado de las reglas y evaluadores aplicados, no una medida científica.
              </p>
            </div>
          )}
        </div>
        {report.generation.mode !== 'ai' && (
          <p className="mt-5 text-xs text-subtle">
            {report.generation.mode === 'demo'
              ? 'Modo demo: el criterio semántico usa reglas a partir del ADN, sin modelo de IA.'
              : 'El criterio semántico usó reglas de respaldo.'}{' '}
            Solo se revisan textos y descripciones: ninguna imagen.
          </p>
        )}
      </header>

      {report.stale && (
        <Alert>
          <p>Este recurso cambió después de esta revisión.</p>
          {actions.onReviewAgain && (
            <button type="button" onClick={actions.onReviewAgain} className="mt-2 underline">
              Revisar nuevamente
            </button>
          )}
        </Alert>
      )}

      {dimensions.length > 0 && (
        <section aria-label="Dimensiones">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dimensions.map((entry) => (
              <li key={entry.dimension} className="rounded-xl border border-line bg-surface p-4">
                <p className="flex items-center justify-between gap-3 text-sm text-muted">
                  {GUARDIAN_DIMENSION_LABELS[entry.dimension]}
                  <StatusMark status={entry.status} small />
                </p>
                <p className="mt-2 font-display text-2xl font-bold">{entry.score}</p>
                {entry.summary && (
                  <p className="mt-2 text-xs leading-relaxed text-subtle">{entry.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.correction && <CorrectionView report={report} actions={actions} />}

      <section aria-label="Hallazgos" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">
            {findings.length ? `Hallazgos · ${findings.length}` : 'Sin hallazgos'}
          </h3>
          {canCorrect(report) && actions.onCorrect && (
            <Button onClick={actions.onCorrect} loading={actions.busy}>
              <Icon name="create" className="size-4" /> Corregir con Pixel
            </Button>
          )}
        </div>
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} onOverride={actions.onOverride} />
        ))}
      </section>
    </article>
  );
}

function StatusMark({
  status,
  small = false,
}: {
  status: GuardianReport['status'];
  small?: boolean;
}) {
  const label = { pass: 'Coherente', warning: 'Advertencia', block: 'Bloquea' }[status];
  return (
    <span
      aria-label={label}
      title={label}
      className={[
        'inline-grid shrink-0 place-items-center rounded-md border',
        small ? 'size-5' : 'size-7',
        status === 'block'
          ? 'border-fg bg-fg text-canvas'
          : status === 'warning'
            ? 'border-fg text-fg'
            : 'border-line-strong text-muted',
      ].join(' ')}
    >
      {status === 'pass' ? (
        <Icon name="check" className={small ? 'size-3' : 'size-4'} />
      ) : (
        <span className="font-bold leading-none">!</span>
      )}
    </span>
  );
}

export function FindingCard({
  finding,
  onOverride,
}: {
  finding: GuardianFinding;
  onOverride?: (findingId: string) => void;
}) {
  const overridable =
    finding.canOverride &&
    !finding.overridden &&
    (finding.blocking ||
      finding.severity === 'medium' ||
      finding.severity === 'high' ||
      finding.severity === 'critical');
  return (
    <div
      className={[
        'rounded-2xl border bg-surface p-5 sm:p-6',
        finding.overridden ? 'border-line opacity-70' : 'border-line-strong',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em]">
        <span className="rounded border border-line-strong px-2 py-0.5 text-muted">
          {GUARDIAN_SEVERITY_LABELS[finding.severity]}
        </span>
        {finding.blocking && !finding.overridden && (
          <span className="rounded bg-fg px-2 py-0.5 text-canvas">Bloquea</span>
        )}
        {finding.overridden && (
          <span className="rounded border border-line px-2 py-0.5 text-subtle">
            Continuaste de todas formas
          </span>
        )}
        <span className="text-subtle">{GUARDIAN_DIMENSION_LABELS[finding.dimension]}</span>
      </div>
      <h4 className="mt-3 text-base font-semibold text-fg">{finding.title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-muted">{finding.message}</p>
      {finding.evidence.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Encontrado en</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            {finding.evidence.map((item) => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finding.brandEvidence.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Basado en</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            {finding.brandEvidence.map((item) => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finding.recommendation && (
        <p className="mt-4 text-sm leading-relaxed text-fg">
          <span className="text-subtle">Recomendación: </span>
          {finding.recommendation}
        </p>
      )}
      {overridable && onOverride && (
        <div className="mt-4">
          <Button variant="ghost" onClick={() => onOverride(finding.id)}>
            Continuar de todas formas
          </Button>
        </div>
      )}
      {finding.blocking && !finding.canOverride && !finding.overridden && (
        <p className="mt-4 text-xs text-subtle">
          Es integridad factual: corrígelo o aporta el dato; no se puede pasar por alto.
        </p>
      )}
    </div>
  );
}

function CorrectionView({
  report,
  actions,
}: {
  report: GuardianReport;
  actions: GuardianReportActions;
}) {
  const correction = report.correction!;
  return (
    <section
      aria-label="Corrección propuesta"
      className="space-y-4 rounded-2xl border border-line-strong bg-surface p-6 sm:p-8"
    >
      <h3 className="font-display text-lg font-bold">
        {correction.appliedAt ? 'Corrección aplicada' : 'Propuesta corregida por Pixel'}
      </h3>
      {correction.changes.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {correction.changes.map((change) => (
            <li key={change}>· {change}</li>
          ))}
        </ul>
      )}
      <div className="space-y-4">
        {correction.fields.map((field) => (
          <div key={field.label} className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">
                Original · {field.label}
              </p>
              <p className="mt-2 break-words text-sm text-muted">{field.original}</p>
            </div>
            <div className="rounded-xl border border-line-strong p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">
                Propuesta corregida
              </p>
              <p className="mt-2 break-words text-sm text-fg">{field.corrected}</p>
            </div>
          </div>
        ))}
      </div>
      {canApply(report) && actions.onApply && (
        <Button onClick={actions.onApply} loading={actions.busy}>
          <Icon name="check" className="size-4" /> Aplicar corrección
        </Button>
      )}
      {!correction.appliedAt && report.resourceType === 'copy' && (
        <p className="text-xs text-subtle">
          Es un texto pegado: copia la propuesta corregida donde la necesites.
        </p>
      )}
    </section>
  );
}
