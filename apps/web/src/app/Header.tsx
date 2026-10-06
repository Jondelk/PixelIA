import { useMatches } from 'react-router';
import { Icon } from '../components/Icon';
import { ApiStatus } from '../features/system/ApiStatus';
import { isRouteHandle } from './navigation';
import { UserMenu } from './UserMenu';

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const handle = useMatches()
    .map((match) => match.handle)
    .filter(isRouteHandle)
    .at(-1);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/75 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={onOpenNav}
        className="-ml-1 rounded-lg p-2 text-muted hover:bg-white/[0.04] hover:text-fg lg:hidden"
        aria-label="Abrir navegación"
        aria-controls="app-sidebar"
      >
        <Icon name="menu" className="size-5" />
      </button>

      <nav aria-label="Ruta actual" className="flex min-w-0 items-center gap-2 text-sm">
        {handle && (
          <>
            <span className="hidden text-subtle sm:inline">{handle.section}</span>
            <Icon name="chevron" className="hidden size-3.5 text-subtle/70 sm:inline" />
            <span className="truncate font-medium text-fg">{handle.title}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <ApiStatus />
        <span className="h-6 w-px bg-line" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  );
}
