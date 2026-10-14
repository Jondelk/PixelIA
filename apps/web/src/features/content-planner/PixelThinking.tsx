import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { PixelPresenceAvatar } from '../presence/PixelPresenceAvatar';
import { getAvatar } from '../pixel/avatarApi';

const PLANNER_COPY = {
  title: 'Pixel está construyendo tu estrategia…',
  description:
    'Está leyendo tu ADN personal, tus proyectos activos y tu contenido reciente para proponerte piezas con un porqué. Puede tardar un poco.',
};

type ThinkingCopy = typeof PLANNER_COPY;

/**
 * Mientras Pixel genera: su personaje en presencia FOCUS («pensando», Prompt 17: es el mismo
 * runtime de presencia, no un visual aparte) y una frase. Sin barras de progreso
 * falsas: no sabemos cuánto falta. Compartido (Content Planner y Campaign Manager): `copy` cambia
 * el texto.
 */
export function PixelThinking({
  workspaceId,
  copy = PLANNER_COPY,
}: {
  workspaceId: string;
  copy?: ThinkingCopy;
}) {
  const { state } = useResource(`avatar:workspace:${workspaceId}`, (signal) =>
    getAvatar(workspaceApiBase(workspaceId), signal),
  );
  const avatar = state.status === 'success' ? state.data.avatar : null;
  return <PixelThinkingView avatar={avatar} copy={copy} />;
}

export function PixelThinkingView({
  avatar,
  copy = PLANNER_COPY,
}: {
  avatar: Parameters<typeof PixelPresenceAvatar>[0]['avatar'];
  copy?: ThinkingCopy;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="grid items-center gap-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:grid-cols-[260px_1fr] sm:p-10"
    >
      <PixelPresenceAvatar avatar={avatar} level="focus" state="thinking" className="!h-64" />
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">{copy.title}</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{copy.description}</p>
      </div>
    </section>
  );
}
