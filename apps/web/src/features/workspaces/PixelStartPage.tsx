import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { workspaceBasePath } from '../../app/navigation';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { Spinner } from '../../components/Spinner';
import { errorMessage } from '../../lib/api';
import { useCurrentUser } from '../auth/authContext';
import { openOrCreatePersonalPixel } from './personalPixel';
import { resolvePixelIntent } from './pixelIntent';
import { listWorkspaces } from './workspacesApi';

/**
 * `/pixels/start?intent=personal|enterprise`: retoma lo que el visitante pidió en Explorar después
 * de iniciar sesión o crear su cuenta. Abre el Pixel que ya tiene (su Inicio continúa el onboarding
 * pendiente) o sigue el alta existente; nunca obliga a elegir de nuevo el tipo de Pixel.
 */
export function PixelStartPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent = params.get('intent');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const resolution = resolvePixelIntent(intent, await listWorkspaces(controller.signal));
        if (controller.signal.aborted) return;
        const to =
          resolution.kind === 'navigate'
            ? resolution.to
            : workspaceBasePath(await openOrCreatePersonalPixel(user));
        if (!controller.signal.aborted) navigate(to, { replace: true });
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      }
    })();
    return () => controller.abort();
  }, [intent, user, navigate, attempt]);

  if (error) {
    return (
      <div className="max-w-xl space-y-6">
        <Alert>{error}</Alert>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Reintentar
          </Button>
          <Link to="/pixels/new" className={buttonClasses('secondary')}>
            Elegir mi Pixel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-3 text-sm text-muted" role="status">
      <Spinner className="size-4 text-fg" /> Preparando tu Pixel…
    </p>
  );
}
