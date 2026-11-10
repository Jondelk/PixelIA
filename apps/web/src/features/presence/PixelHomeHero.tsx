import type { AvatarPreview } from '@pixel/contracts';
import { workspaceBasePath } from '../../app/navigation';
import { PixelCommand } from '../pixel-command/PixelCommand';
import type { ComposerSuggestion } from './PixelComposer';
import { PixelPresenceAvatar } from './PixelPresenceAvatar';
import { usePixelPresence } from './presenceContext';

/*
 * Inicio con presencia (Prompt 17, Personal y Enterprise): "Este es el espacio donde vive mi Pixel".
 * El Pixel (nivel interactive, el ÚNICO 3D de la pantalla) junto a "¿Qué necesitas hacer?". Sin
 * ocupar media pantalla: en escritorio conviven avatar y entrada; en móvil el avatar es compacto.
 * Las sugerencias solo empiezan una frase (nunca llevan a un formulario).
 */

export function PixelHomeHero({
  workspaceId,
  eyebrow,
  name,
  title,
  suggestions,
  avatar: avatarProp,
}: {
  workspaceId: string;
  eyebrow: string;
  name: string;
  title?: string;
  suggestions: ComposerSuggestion[];
  /** Si la pantalla ya lo tiene; si no, el del Pixel ligado a la presencia. */
  avatar?: AvatarPreview | null;
}) {
  const { scope } = usePixelPresence();
  const avatar =
    avatarProp !== undefined
      ? avatarProp
      : scope?.workspaceId === workspaceId
        ? scope.avatar
        : null;
  return (
    <section
      aria-label={`Pixel de ${name}`}
      className="mb-12 grid items-start gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10"
    >
      <PixelPresenceAvatar
        avatar={avatar}
        level="interactive"
        announce
        className="max-sm:!h-28 max-sm:!w-24"
      />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
        <p className="mb-6 mt-2 font-display text-lg font-bold tracking-tight text-muted">{name}</p>
        <PixelCommand
          workspaceId={workspaceId}
          base={workspaceBasePath(workspaceId)}
          title={title}
          suggestions={suggestions}
          thinkingAvatar="none"
        />
      </div>
    </section>
  );
}
