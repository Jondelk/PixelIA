import type { AvatarPreview } from '@pixel/contracts';
import { Pixi } from '../../components/Pixi';
import { AvatarStage } from '../avatar3d/AvatarStage';
import { PixelPreview } from '../pixel/PixelPreview';
import { useModelUrl } from '../pixel/useModelUrl';
import { avatarStateFor, PRESENCE_LABELS, type PixelPresenceState } from './presenceMachine';
import { usePixelPresence } from './presenceContext';

/*
 * PixelAvatarRuntime en la interfaz (Prompt 17). Tres niveles para no poner un personaje grande en
 * todas partes:
 *   - ambient: pequeño, indica presencia. SIEMPRE 2D (SVG): ningún contexto WebGL extra.
 *   - interactive: el Pixel junto a la entrada (Inicio). 3D, uno solo por pantalla.
 *   - focus: protagonista temporal (pensando, hablando, revisando). 3D.
 * Sin personaje (marca o persona sin configurar): Pixi neutral, nunca un avatar inventado. Si el
 * 3D no carga, AvatarStage cae a la vista 2D. El estado nunca se comunica solo con movimiento o
 * color: también en texto (aria-live).
 */

export type PresenceLevel = 'ambient' | 'interactive' | 'focus';

const SIZE: Record<PresenceLevel, string> = {
  ambient: 'size-12',
  interactive: 'h-44 w-36 sm:h-52 sm:w-44',
  focus: 'h-56 w-full',
};

const ACTIVE: PixelPresenceState[] = ['listening', 'thinking', 'speaking', 'reviewing'];

export function PixelPresenceAvatar({
  avatar,
  level,
  state: stateOverride,
  className = '',
  announce = false,
}: {
  avatar: AvatarPreview | null;
  level: PresenceLevel;
  /** Por defecto, el estado compartido del Pixel. */
  state?: PixelPresenceState;
  className?: string;
  /** Anunciar el estado a lectores de pantalla (solo en UNA superficie por pantalla). */
  announce?: boolean;
}) {
  const presence = usePixelPresence();
  const state = stateOverride ?? presence.state;
  const active = ACTIVE.includes(state);
  const accent = presence.accent.color;
  // En 3D, el modelo esculpido del personaje si ya existe (si no, el paramétrico).
  const modelUrl = useModelUrl(
    level === 'ambient' ? null : (presence.scope?.workspaceId ?? null),
    avatar?.version ?? null,
  );
  const ring = level === 'ambient' ? 'rounded-xl' : 'rounded-2xl';

  return (
    <div
      className={`relative shrink-0 ${SIZE[level]} ${className}`}
      data-presence={state}
      data-level={level}
    >
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-0 border transition-opacity duration-500 ease-pxl',
          ring,
          active ? 'opacity-100' : 'opacity-40',
          active && !presence.reducedMotion ? 'motion-safe:animate-pulse' : '',
          accent ? '' : 'border-line-strong',
        ].join(' ')}
        style={accent ? { borderColor: accent } : undefined}
      />
      <div className={`grid h-full w-full place-items-center overflow-hidden ${ring}`}>
        {avatar ? (
          level === 'ambient' ? (
            <PixelPreview key={avatar.id} profile={avatar} className="h-full w-full" />
          ) : (
            <AvatarStage
              avatar={avatar}
              state={avatarStateFor(state)}
              interactive={false}
              reducedMotion={presence.reducedMotion}
              modelUrl={modelUrl}
              className="!h-full"
            />
          )
        ) : (
          <Pixi size={level === 'ambient' ? 36 : 112} />
        )}
      </div>
      {announce && (
        <span className="sr-only" role="status" aria-live="polite">
          {PRESENCE_LABELS[state]}
        </span>
      )}
    </div>
  );
}

/** Punto de presencia (topbar, Dock plegado): estado en color de acento + texto. */
export function PresenceDot({ state }: { state: PixelPresenceState }) {
  const { accent } = usePixelPresence();
  const active = ACTIVE.includes(state);
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-1.5 ${active ? 'motion-safe:animate-pulse' : ''} ${accent.color ? '' : state === 'warning' || state === 'error' ? 'bg-alert' : 'bg-fg'}`}
      style={accent.color ? { backgroundColor: accent.color } : undefined}
    />
  );
}
