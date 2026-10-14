import { Navigate, useNavigate } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { Spinner } from '../../components/Spinner';
import { workspaceBasePath } from '../../app/navigation';
import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { loadChatData } from '../chat/chatData';
import { ChatStudio } from '../chat/ChatStudio';
import { useWorkspace } from '../workspaces/workspaceContext';

/**
 * /workspace/:workspaceId/chat en Personal: el mismo ChatStudio, con las mismas rutas de
 * conversaciones del workspace. Sin PersonalDNA (o si la API responde
 * personal_context_not_configured) lleva al onboarding.
 */
export function PersonalChatPage() {
  const navigate = useNavigate();
  const { overview } = useWorkspace();
  const { workspace, personal } = overview;
  const base = workspaceBasePath(workspace.id);
  const onboarding = `${base}/personal/onboarding`;
  const apiBase = workspaceApiBase(workspace.id);
  const { state, reload } = useResource(`chat:workspace:${workspace.id}`, (signal) =>
    loadChatData(apiBase, signal),
  );

  if (!personal?.personalDnaVersion) return <Navigate to={onboarding} replace />;
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Preparando la conversación…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  return (
    <ChatStudio
      key={workspace.id}
      apiBase={apiBase}
      ownerName={personal.name ?? workspace.name}
      kind="personal"
      pixelHref={`${base}/pixel`}
      initial={state.data}
      onNotConfigured={() => navigate(onboarding, { replace: true })}
    />
  );
}
