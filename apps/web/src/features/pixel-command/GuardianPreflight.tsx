import { GUARDIAN_SEVERITY_LABELS, type GuardianPreflightSummary } from '@pixel/contracts';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { openFindings, preflightHeadline, sortFindings } from '../guardian/guardianLogic';

/**
 * Brand Guardian en la propuesta de Pixel (preflight): una línea compacta ("✓ Coherente con la
 * marca", "2 ajustes recomendados") y el detalle solo si se pide. Si Pixel corrigió algo antes de
 * mostrar la propuesta, lo dice.
 */
export function GuardianPreflight({ guardian }: { guardian: GuardianPreflightSummary }) {
  const [open, setOpen] = useState(false);
  const pending = openFindings(guardian.findings);
  const blocked = guardian.status === 'block' && !guardian.overridden;
  return (
    <div aria-label="Brand Guardian" className="rounded-xl border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-fg">
          <span
            aria-hidden="true"
            className={[
              'inline-grid size-5 place-items-center rounded border',
              blocked
                ? 'border-fg bg-fg text-canvas'
                : guardian.status === 'warning'
                  ? 'border-fg'
                  : 'border-line-strong',
            ].join(' ')}
          >
            {guardian.status === 'pass' || guardian.overridden ? (
              <Icon name="check" className="size-3" />
            ) : (
              <span className="text-xs font-bold">!</span>
            )}
          </span>
          <span>
            <span className="text-subtle">Guardian · </span>
            {guardian.overridden
              ? 'Continuaste de todas formas'
              : preflightHeadline(
                  guardian.status,
                  pending.length,
                  pending.filter((finding) => finding.blocking).length,
                )}
          </span>
        </p>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="text-xs text-muted underline hover:text-fg"
          >
            {open ? 'Ocultar' : 'Ver detalle'}
          </button>
        )}
      </div>
      {guardian.correctionNote && (
        <p className="mt-2 text-xs leading-relaxed text-muted">{guardian.correctionNote}</p>
      )}
      {open && (
        <ul className="mt-3 space-y-3">
          {sortFindings(pending).map((finding) => (
            <li key={finding.id} className="text-sm">
              <p className="text-fg">
                <span className="text-xs uppercase tracking-[0.14em] text-subtle">
                  {GUARDIAN_SEVERITY_LABELS[finding.severity]}
                  {finding.blocking ? ' · bloquea' : ''}
                </span>{' '}
                {finding.title}
              </p>
              <p className="mt-1 text-muted">{finding.message}</p>
              {finding.recommendation && (
                <p className="mt-1 text-subtle">{finding.recommendation}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
