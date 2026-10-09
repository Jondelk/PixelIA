import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Reveal } from '../../components/Reveal';
import { useResource } from '../../lib/useResource';
import { PixelCardSkeleton } from '../companies/PixelCard';
import { useCurrentUser } from '../auth/authContext';
import { WorkspaceCard } from '../workspaces/WorkspaceCard';
import { listWorkspaces } from '../workspaces/workspacesApi';

/** "Tus Pixels": un Pixel por workspace, Personal o de Empresa. */
export function DashboardPage() {
  const user = useCurrentUser();
  const { state, reload } = useResource('workspaces', listWorkspaces);
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow={`Hola, ${firstName}`}
          title="Tus Pixels"
          description="Un Pixel para cada forma de crear: el tuyo personal y uno por cada marca."
        />
        {state.status === 'success' && state.data.length > 0 && (
          <NewPixelLink className="mb-8 sm:mb-10" />
        )}
      </div>

      {state.status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <PixelCardSkeleton />
          <PixelCardSkeleton />
          <PixelCardSkeleton />
        </div>
      )}

      {state.status === 'error' && <ErrorState error={state.error} onRetry={reload} />}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          title="Aún no tienes ningún Pixel"
          description="Crea tu primer Pixel: el tuyo personal o el director creativo de tu marca."
          action={<NewPixelLink />}
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.data.map((overview) => (
            <Reveal key={overview.workspace.id}>
              <WorkspaceCard overview={overview} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}

function NewPixelLink({ className = '' }: { className?: string }) {
  return (
    <Link to="/pixels/new" className={buttonClasses('primary', className)}>
      <Icon name="plus" className="size-4" /> Nuevo Pixel
    </Link>
  );
}
