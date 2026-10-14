import { Link } from 'react-router';
import type { ExperienceKind } from '../../brand/experience';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/authContext';
import { pixelIntentPath } from '../workspaces/pixelIntent';
import { useAuthDialog } from './authDialogContext';
import { EXPLORE_MODES } from './exploreContent';

/**
 * Acciones que necesitan cuenta. Con sesión llevan a `/pixels/start`, que abre el Pixel que ya
 * existe o continúa el alta. Sin sesión abren el acceso y conservan esa intención como destino.
 */
export function StartPixelActions({ kind }: { kind: ExperienceKind }) {
  const { state } = useAuth();
  const { openAuth } = useAuthDialog();
  const mode = EXPLORE_MODES[kind];
  const next = pixelIntentPath(kind);

  if (state.status === 'authenticated') {
    return (
      <Link to={next} className={buttonClasses('primary', 'px-6 py-3 text-base')}>
        {mode.start.authenticated} <Icon name="arrowRight" className="size-4" />
      </Link>
    );
  }

  const checking = state.status === 'loading';
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <button
        type="button"
        disabled={checking}
        onClick={(event) => openAuth('register', { next, opener: event.currentTarget })}
        className={buttonClasses('primary', 'px-6 py-3 text-base')}
      >
        {mode.start.anonymous} <Icon name="arrowRight" className="size-4" />
      </button>
      <button
        type="button"
        disabled={checking}
        onClick={(event) => openAuth('login', { next, opener: event.currentTarget })}
        className="text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg disabled:opacity-50"
      >
        Ya tengo cuenta
      </button>
    </div>
  );
}
