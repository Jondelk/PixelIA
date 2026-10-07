import { NavLink, useMatches } from 'react-router';
import { BrandLogo } from '../components/BrandLogo';
import { Icon } from '../components/Icon';
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
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-canvas',
        'transition-[translate,visibility] duration-300 ease-pxl max-lg:shadow-overlay',
        open ? 'translate-x-0' : 'max-lg:invisible max-lg:-translate-x-full',
      ].join(' ')}
      aria-label="Navegación principal"
    >
      {/* Logo con su área de protección (1 píxel libre por lado); el producto va aparte. */}
      <div className="border-b border-line px-6 pb-6 pt-7">
        <BrandLogo height={28} />
        <p className="mt-5 text-[13px] leading-snug text-muted">
          <span className="font-semibold text-fg">Pixel</span> · director creativo
        </p>
      </div>

      <nav className="flex-1 space-y-9 overflow-y-auto px-3 py-7">
        <NavSection label="General" items={primaryNav} onNavigate={onNavigate} />

        {companyId ? (
          <NavSection label="Empresa" items={companyNav(companyId)} onNavigate={onNavigate} />
        ) : (
          <div className="px-3">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              Empresa
            </p>
            <p className="text-xs leading-relaxed text-subtle">
              Abre una empresa para ver su ADN, su personaje y el chat.
            </p>
          </div>
        )}
      </nav>

      <div className="border-t border-line px-6 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">MVP 0.1</p>
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
      <p className="mb-2.5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
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
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-elevated font-medium text-fg' : 'text-muted hover:text-fg',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    className={[
                      'size-[18px] transition-colors',
                      isActive ? 'text-fg' : 'text-subtle group-hover:text-muted',
                    ].join(' ')}
                  />
                  <span className="flex-1">{item.label}</span>
                  {/* Píxel señal: marca la sección activa. */}
                  {isActive && <span className="size-1.5 bg-signal" aria-hidden="true" />}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
