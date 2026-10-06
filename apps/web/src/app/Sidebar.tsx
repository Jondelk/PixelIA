import { NavLink, useMatches } from 'react-router';
import { Icon } from '../components/Icon';
import { PixelMark } from '../components/PixelMark';
import { companyNav, primaryNav, type NavItem } from './navigation';

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const companyId = useMatches().at(-1)?.params.companyId;

  return (
    <aside
      id="app-sidebar"
      className={[
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface',
        'transition-[translate,visibility] duration-200 ease-out',
        open ? 'translate-x-0' : 'max-lg:invisible max-lg:-translate-x-full',
      ].join(' ')}
      aria-label="Navegación principal"
    >
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <PixelMark className="size-8" />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-tight">Pixel</p>
          <p className="text-[11px] text-subtle">Director creativo IA</p>
        </div>
      </div>

      <nav className="flex-1 space-y-8 overflow-y-auto px-3 py-6">
        <NavSection label="General" items={primaryNav} onNavigate={onNavigate} />

        {companyId ? (
          <NavSection label="Empresa" items={companyNav(companyId)} onNavigate={onNavigate} />
        ) : (
          <div className="px-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              Empresa
            </p>
            <p className="text-xs leading-relaxed text-subtle">
              Abre una empresa para ver su ADN, su Pixel y el chat.
            </p>
          </div>
        )}
      </nav>

      <div className="border-t border-line px-5 py-4">
        <p className="font-mono text-[11px] text-subtle">MVP 0.1 · base técnica</p>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent/[0.07] text-fg'
                    : 'text-muted hover:bg-white/[0.03] hover:text-fg',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-opacity',
                      isActive
                        ? 'bg-accent opacity-100 shadow-[0_0_10px_var(--color-accent)]'
                        : 'opacity-0',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  <Icon
                    name={item.icon}
                    className={[
                      'size-[18px] transition-colors',
                      isActive ? 'text-accent' : 'text-subtle group-hover:text-muted',
                    ].join(' ')}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
