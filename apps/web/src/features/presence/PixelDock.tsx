import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon } from '../../components/Icon';
import { PixelCommand } from '../pixel-command/PixelCommand';
import { dockContextLabel, dockResourceFor, dockVisibleAt } from './dockContext';
import { PixelPresenceAvatar, PresenceDot } from './PixelPresenceAvatar';
import { usePixelPresence } from './presenceContext';

/*
 * Pixel Dock (Prompt 17): Pixel presente en todo el workspace configurado, sin otro asistente.
 * Plegado: un control pequeño que no tapa el contenido. Desplegado: PixelCommand (el mismo flujo,
 * la misma confirmación) con el recurso que el usuario está viendo como pista validada en el
 * backend. La conversación completa sigue en Chat.
 */
export function PixelDock({ base, chatPath }: { base: string; chatPath: string }) {
  const presence = usePixelPresence();
  const { pathname } = useLocation();
  // Abierto solo en la ruta donde se abrió: al navegar, el Dock se pliega solo (el contexto cambia).
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);
  const panelId = useId();
  const scope = presence.scope;
  const resource = dockResourceFor(pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenAt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!scope?.configured || !dockVisibleAt(pathname)) return null;
  const contextLabel = dockContextLabel(resource);

  return (
    <PixelDockView
      open={open}
      panelId={panelId}
      name={scope.name}
      contextLabel={contextLabel}
      onToggle={() => setOpen(!open)}
      collapsedAvatar={
        <PixelPresenceAvatar avatar={scope.avatar} level="ambient" className="!size-9" />
      }
      chatPath={chatPath}
      body={
        <PixelCommand
          key={`${scope.workspaceId}:${resource?.id ?? 'workspace'}`}
          workspaceId={scope.workspaceId}
          base={base}
          title="¿Qué necesitas?"
          placeholder="Escríbele a Pixel…"
          thinkingAvatar="none"
          contextHint={resource ? { resource } : undefined}
          calendarReturnTo="pixel"
        />
      }
    />
  );
}

/** Vista (testeable): botón plegado o panel desplegado. */
export function PixelDockView({
  open,
  panelId,
  name,
  contextLabel,
  onToggle,
  collapsedAvatar,
  body,
  chatPath,
}: {
  open: boolean;
  panelId: string;
  name: string;
  contextLabel: string | null;
  onToggle: () => void;
  collapsedAvatar: ReactNode;
  body: ReactNode;
  chatPath: string;
}) {
  const presence = usePixelPresence();
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-30 flex justify-end sm:inset-x-auto sm:bottom-6 sm:right-6">
      {open ? (
        <section
          id={panelId}
          aria-label={`Pixel de ${name}`}
          className="pointer-events-auto max-h-[80dvh] w-full overflow-y-auto rounded-2xl border border-line-strong bg-surface p-5 sm:w-[420px]"
        >
          <header className="mb-4 flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-subtle">
              <PresenceDot state={presence.state} />
              <span className="truncate">Pixel · {name}</span>
            </p>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Cerrar Pixel"
              aria-controls={panelId}
              className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
            >
              <Icon name="x" className="size-4" />
            </button>
          </header>
          {contextLabel && <p className="mb-3 text-xs text-muted">{contextLabel}</p>}
          {body}
          <Link
            to={chatPath}
            className="mt-4 inline-flex items-center gap-2 text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Ver la conversación completa <Icon name="arrowRight" className="size-3" />
          </Link>
        </section>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Abrir Pixel de ${name}`}
          aria-expanded={false}
          aria-controls={panelId}
          className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-line-strong bg-surface py-1.5 pl-1.5 pr-3.5 text-sm text-fg transition-colors hover:bg-elevated"
        >
          {collapsedAvatar}
          <span className="flex items-center gap-2">
            <span>Pixel</span>
            <span className="text-xs text-subtle max-sm:hidden">{presence.label}</span>
          </span>
        </button>
      )}
    </div>
  );
}
