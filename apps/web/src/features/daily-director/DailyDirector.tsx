import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { getAvatar } from '../pixel/avatarApi';
import { useWorkspace } from '../workspaces/workspaceContext';
import { updateWorkspace } from '../workspaces/workspacesApi';
import { generateDailyBrief, getDailyBrief } from './dailyBriefApi';
import { browserTimezone, isNotGenerated } from './dailyLogic';
import { DailyDirectorView, type DailyState } from './DailyDirectorView';
import type { DailyBriefResponse } from '@pixel/contracts';

/**
 * Contenedor de "TU DÍA" en el Inicio Personal:
 * - carga la dirección vigente (GET); si aún no existe hoy, la genera UNA vez;
 * - nunca regenera al recargar: si el trabajo cambió, la API marca `stale` y se ofrece actualizar;
 * - "Actualizar dirección" crea una versión nueva del día.
 */
export function DailyDirector({
  workspaceId,
  firstName,
  base,
}: {
  workspaceId: string;
  firstName: string;
  base: string;
}) {
  const { overview, reload: reloadWorkspace } = useWorkspace();
  const current = useResource(`daily-brief:${workspaceId}`, (signal) =>
    getDailyBrief(workspaceId, signal),
  );
  const avatarState = useResource(`avatar:workspace:${workspaceId}`, (signal) =>
    getAvatar(workspaceApiBase(workspaceId), signal),
  );
  const [fresh, setFresh] = useState<DailyBriefResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const autoRequested = useRef(false);

  const generate = useCallback(() => {
    setGenerating(true);
    setFailure(null);
    generateDailyBrief(workspaceId)
      .then(setFresh)
      .catch(setFailure)
      .finally(() => setGenerating(false));
  }, [workspaceId]);

  // Primera visita del día: no hay dirección → se genera una vez (no en cada carga).
  const missing = current.state.status === 'error' && isNotGenerated(current.state.error);
  useEffect(() => {
    if (missing && !autoRequested.current) {
      autoRequested.current = true;
      generate();
    }
  }, [missing, generate]);

  const loaded = current.state.status === 'success' ? current.state.data : null;
  const data = fresh ?? loaded;
  let state: DailyState;
  if (generating || (missing && !failure && !fresh))
    state = { status: 'generating', previous: data };
  else if (failure) state = { status: 'error', error: failure };
  else if (data) state = { status: 'ready', data };
  else if (current.state.status === 'error')
    state = { status: 'error', error: current.state.error };
  else state = { status: 'loading' };

  const tz = browserTimezone();
  const showTimezone = Boolean(
    data && !overview.workspace.timezone && tz && tz !== data.brief.timezone,
  );

  return (
    <DailyDirectorView
      base={base}
      firstName={firstName}
      state={state}
      avatar={avatarState.state.status === 'success' ? avatarState.state.data.avatar : null}
      onRegenerate={generate}
      onRetry={() => {
        setFailure(null);
        if (missing || !data) generate();
        else current.reload();
      }}
      timezonePrompt={
        showTimezone && data ? (
          <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
            Pixel calcula tu día con la zona horaria {data.brief.timezone}.
            <Button
              variant="ghost"
              className="!px-2 !py-1"
              onClick={() =>
                void updateWorkspace(workspaceId, { timezone: tz }).then(() => {
                  reloadWorkspace();
                  generate();
                })
              }
            >
              Usar la mía ({tz})
            </Button>
          </p>
        ) : null
      }
    />
  );
}
