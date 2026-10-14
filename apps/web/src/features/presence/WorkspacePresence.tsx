import type { WorkspaceOverview } from '@pixel/contracts';
import { companyBasePath, workspaceBasePath } from '../../app/navigation';
import { useResource } from '../../lib/useResource';
import { getWorkspace } from '../workspaces/workspacesApi';
import { PixelDock } from './PixelDock';
import { PresenceScope } from './PixelPresenceProvider';

/**
 * Liga la presencia al Pixel de la pantalla (su personaje, su voz y su acento) y monta el Pixel
 * Dock. Un Pixel "configurado" es el que ya conoce su ADN: antes, nada de presencia personalizada.
 */
export function WorkspacePresence({ overview }: { overview: WorkspaceOverview }) {
  const { workspace, company, personal } = overview;
  const configured = Boolean(company?.brandDnaVersion ?? personal?.personalDnaVersion);
  const chatPath = company
    ? `${companyBasePath(company.id)}/chat`
    : `${workspaceBasePath(workspace.id)}/chat`;
  return (
    <PresenceScope
      info={{
        workspaceId: workspace.id,
        name: company?.name ?? personal?.name ?? workspace.name,
        avatar: overview.avatar,
        configured,
      }}
    >
      <PixelDock base={workspaceBasePath(workspace.id)} chatPath={chatPath} />
    </PresenceScope>
  );
}

/** Pantallas de empresa (/company/:companyId): carga el resumen de su workspace para la presencia. */
export function CompanyPresence({ workspaceId }: { workspaceId: string }) {
  const { state } = useResource(`workspace-presence:${workspaceId}`, (signal) =>
    getWorkspace(workspaceId, signal),
  );
  if (state.status !== 'success') return null;
  return <WorkspacePresence overview={state.data} />;
}
