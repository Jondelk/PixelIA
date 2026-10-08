import { Pixi } from '../../components/Pixi';
import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { AvatarStage } from '../avatar3d/AvatarStage';
import { getAvatar } from '../pixel/avatarApi';

/**
 * Mientras Pixel genera: su personaje en estado "thinking" y una frase. Sin barras de progreso
 * falsas: no sabemos cuánto falta.
 */
export function PixelThinking({ workspaceId }: { workspaceId: string }) {
  const { state } = useResource(`avatar:workspace:${workspaceId}`, (signal) =>
    getAvatar(workspaceApiBase(workspaceId), signal),
  );
  const avatar = state.status === 'success' ? state.data.avatar : null;
  return <PixelThinkingView avatar={avatar} />;
}

export function PixelThinkingView({
  avatar,
}: {
  avatar: Parameters<typeof AvatarStage>[0]['avatar'] | null;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="grid items-center gap-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:grid-cols-[260px_1fr] sm:p-10"
    >
      <div className="h-64">
        {avatar ? (
          <AvatarStage avatar={avatar} state="thinking" interactive={false} className="!h-full" />
        ) : (
          <div className="grid h-full place-items-center">
            <Pixi size={140} />
          </div>
        )}
      </div>
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">
          Pixel está construyendo tu estrategia…
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Está leyendo tu ADN personal, tus proyectos activos y tu contenido reciente para
          proponerte piezas con un porqué. Puede tardar un poco.
        </p>
      </div>
    </section>
  );
}
