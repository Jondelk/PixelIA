import { GUARDIAN_RESOURCE_LABELS, type GuardianReport } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { workspaceBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource, type ResourceState } from '../../lib/useResource';
import { listCampaigns } from '../campaigns/campaignsApi';
import { listContentPlans } from '../content-planner/contentPlansApi';
import { listContent } from '../operations/contentApi';
import { useWorkspace } from '../workspaces/workspaceContext';
import { evaluateWithGuardian, listGuardianReports } from './guardianApi';
import { presenceAfterReview, STATUS_HEADLINE } from './guardianLogic';
import { usePixelPresence } from '../presence/presenceContext';

type Kind = 'campaign' | 'content_plan' | 'content_item' | 'copy';

const ACTIONS: { kind: Kind; label: string }[] = [
  { kind: 'campaign', label: 'Revisar campaña' },
  { kind: 'content_plan', label: 'Revisar plan' },
  { kind: 'content_item', label: 'Revisar contenido' },
  { kind: 'copy', label: 'Revisar texto' },
];

/**
 * /workspace/:workspaceId/guardian — Brand Guardian (solo Enterprise). Revisa si campañas, planes,
 * contenido o un texto pegado mantienen la coherencia de la marca. Un selector simple por recurso:
 * nada de formularios largos (el texto pegado sí lo aporta el usuario).
 */
export function GuardianPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const navigate = useNavigate();
  const presence = usePixelPresence();
  const [kind, setKind] = useState<Kind>('campaign');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reports = useResource(`guardian-reports:${workspaceId}`, (signal) =>
    listGuardianReports(workspaceId, { limit: 10 }, signal),
  );

  const run = async (input: Parameters<typeof evaluateWithGuardian>[1]) => {
    setBusy(true);
    setError(null);
    presence.review();
    try {
      const report = await evaluateWithGuardian(workspaceId, input);
      presence.send(presenceAfterReview(report.status));
      navigate(`${base}/guardian/reports/${report.id}`);
    } catch (err) {
      presence.fail();
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Marca"
        title="Brand Guardian"
        description={`Revisa si campañas y contenido mantienen la coherencia de ${overview.company?.name ?? 'tu marca'}: qué encaja, qué no y por qué, con la parte del ADN en la que se basa.`}
      />
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div role="group" aria-label="Qué revisar" className="flex flex-wrap gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.kind}
              type="button"
              aria-pressed={kind === action.kind}
              onClick={() => setKind(action.kind)}
              className={[
                'rounded-lg border px-3.5 py-2 text-sm transition-colors',
                kind === action.kind
                  ? 'border-fg text-fg'
                  : 'border-line text-muted hover:border-line-strong hover:text-fg',
              ].join(' ')}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {kind === 'copy' ? (
            <CopyReview
              busy={busy}
              onReview={(content, facts) =>
                void run({ resourceType: 'copy', content, confirmedFacts: facts })
              }
            />
          ) : (
            <ResourceReview
              key={kind}
              kind={kind}
              workspaceId={workspaceId}
              busy={busy}
              onReview={(resourceId) => void run({ resourceType: kind, resourceId })}
            />
          )}
        </div>
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
      </section>

      <RecentReports state={reports.state} base={base} />
    </>
  );
}

function ResourceReview({
  kind,
  workspaceId,
  busy,
  onReview,
}: {
  kind: Exclude<Kind, 'copy'>;
  workspaceId: string;
  busy: boolean;
  onReview: (resourceId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const { state } = useResource(`guardian-options:${workspaceId}:${kind}`, async (signal) => {
    if (kind === 'campaign') {
      return (await listCampaigns(workspaceId, { limit: 100 }, signal)).campaigns.map((c) => ({
        value: c.id,
        label: c.name,
      }));
    }
    if (kind === 'content_plan') {
      return (await listContentPlans(workspaceId, {}, signal)).plans.map((p) => ({
        value: p.id,
        label: p.name,
      }));
    }
    return (await listContent(workspaceId, { limit: 100 }, signal)).contentItems.map((c) => ({
      value: c.id,
      label: c.title,
    }));
  });
  const options = state.status === 'success' ? state.data : [];
  const empty = state.status === 'success' && options.length === 0;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 sm:max-w-md">
        <SelectField
          label={GUARDIAN_RESOURCE_LABELS[kind]}
          value={selected}
          options={options}
          onValueChange={setSelected}
          placeholder={
            state.status === 'loading'
              ? 'Cargando…'
              : empty
                ? 'Todavía no hay nada que revisar'
                : 'Elige qué revisar'
          }
        />
      </div>
      <Button onClick={() => selected && onReview(selected)} disabled={!selected} loading={busy}>
        <Icon name="guardian" className="size-4" /> Revisar
      </Button>
    </div>
  );
}

function CopyReview({
  busy,
  onReview,
}: {
  busy: boolean;
  onReview: (content: string, facts: string[]) => void;
}) {
  const [content, setContent] = useState('');
  const [facts, setFacts] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    onReview(
      content,
      facts
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10),
    );
  };
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Revisar texto">
      <TextAreaField
        label="Pega el texto que quieres revisar"
        value={content}
        maxLength={4000}
        onChange={(event) => setContent(event.target.value)}
        placeholder="«Conoce el origen que acompaña cada taza.»"
      />
      <TextAreaField
        label="Datos confirmados (opcional)"
        hint="Una línea por dato real que el texto puede afirmar: una promoción vigente, una cifra con fuente."
        value={facts}
        onChange={(event) => setFacts(event.target.value)}
      />
      <Button type="submit" loading={busy} disabled={!content.trim()}>
        <Icon name="guardian" className="size-4" /> Revisar texto
      </Button>
    </form>
  );
}

function RecentReports({
  state,
  base,
}: {
  state: ResourceState<{ reports: GuardianReport[] }>;
  base: string;
}) {
  if (state.status !== 'success' || !state.data.reports.length) return null;
  return (
    <section aria-label="Revisiones recientes" className="mt-10">
      <h2 className="mb-4 font-display text-lg font-bold">Revisiones recientes</h2>
      <ul className="space-y-2">
        {state.data.reports.map((report) => (
          <li key={report.id}>
            <Link
              to={`${base}/guardian/reports/${report.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:border-line-strong"
            >
              <span className="min-w-0 truncate text-fg">
                {GUARDIAN_RESOURCE_LABELS[report.resourceType]} · {report.resourceLabel}
              </span>
              <span className="text-muted">
                {STATUS_HEADLINE[report.status]}
                {report.score !== null ? ` · ${report.score}/100` : ''}
                {report.stale ? ' · desactualizada' : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
