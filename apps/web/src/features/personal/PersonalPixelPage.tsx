import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { workspaceBasePath } from '../../app/navigation';
import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { getAvatar } from '../pixel/avatarApi';
import { PixelStudio } from '../pixel/PixelPage';
import { useWorkspace } from '../workspaces/workspaceContext';

/** /workspace/:workspaceId/pixel en Personal: el mismo estudio de personaje, desde el PersonalDNA. */
export function PersonalPixelPage() {
  const { overview, reload: reloadWorkspace } = useWorkspace();
  const { workspace, personal } = overview;
  const apiBase = workspaceApiBase(workspace.id);
  const { state, reload } = useResource(`avatar:workspace:${workspace.id}`, (signal) =>
    getAvatar(apiBase, signal),
  );

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Cargando tu personaje…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  if (!state.data.dnaVersion) {
    return (
      <EmptyState
        title="Pixel aún no te conoce"
        description="Para crear tu personaje, Pixel necesita primero tu ADN personal. Completa el onboarding de 8 pasos."
        action={
          <Link
            to={`${workspaceBasePath(workspace.id)}/personal/onboarding`}
            className={buttonClasses('primary')}
          >
            Ir al onboarding <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      />
    );
  }

  return (
    <PixelStudio
      key={workspace.id}
      apiBase={apiBase}
      ownerName={personal?.name ?? workspace.name}
      kind="personal"
      initial={state.data}
      onGenerated={reloadWorkspace}
    />
  );
}
