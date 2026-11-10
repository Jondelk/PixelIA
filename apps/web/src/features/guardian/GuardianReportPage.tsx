import type { GuardianReport } from '@pixel/contracts';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { workspaceBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import {
  applyGuardianCorrection,
  correctWithPixel,
  evaluateWithGuardian,
  getGuardianReport,
  overrideGuardianFinding,
} from './guardianApi';
import { GuardianReportView } from './GuardianReportView';

/** /workspace/:workspaceId/guardian/reports/:reportId — un informe guardado (no vuelve a evaluar). */
export function GuardianReportPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const base = workspaceBasePath(workspaceId);
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const { state, reload } = useResource(`guardian-report:${workspaceId}:${reportId}`, (signal) =>
    getGuardianReport(workspaceId, reportId, signal),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<GuardianReport | null>(null);
  const report = current ?? (state.status === 'success' ? state.data : null);

  const act = async (action: () => Promise<GuardianReport>, openNew = false) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (openNew && next.id !== report?.id) navigate(`${base}/guardian/reports/${next.id}`);
      else setCurrent(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link
        to={`${base}/guardian`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
      >
        <Icon name="arrowLeft" className="size-4" /> Brand Guardian
      </Link>
      {state.status === 'loading' && !report && <Spinner />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={reload} />}
      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {report && (
        <GuardianReportView
          key={report.id}
          report={report}
          actions={{
            busy,
            onOverride: (findingId) =>
              void act(() => overrideGuardianFinding(workspaceId, report.id, findingId)),
            onCorrect: () => void act(() => correctWithPixel(workspaceId, report.id), true),
            onApply: () => void act(() => applyGuardianCorrection(workspaceId, report.id)),
            onReviewAgain:
              report.resourceId &&
              report.resourceType !== 'copy' &&
              report.resourceType !== 'pixel_proposal'
                ? () =>
                    void act(
                      () =>
                        evaluateWithGuardian(workspaceId, {
                          resourceType: report.resourceType as
                            'campaign' | 'content_plan' | 'content_plan_item' | 'content_item',
                          resourceId: report.resourceId!,
                        }),
                      true,
                    )
                : undefined,
          }}
        />
      )}
    </>
  );
}
