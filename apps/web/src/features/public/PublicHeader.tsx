import { Link, NavLink } from 'react-router';
import { UserMenu } from '../../app/UserMenu';
import { BrandLogo } from '../../components/BrandLogo';
import { buttonClasses } from '../../components/buttonClasses';
import { useAuth } from '../auth/authContext';
import { useAuthDialog } from './authDialogContext';

const EXPLORE_NAV = [
  { to: '/explore', label: 'Explorar', end: true },
  { to: '/explore/personal', label: 'Pixel Personal', end: false },
  { to: '/explore/enterprise', label: 'Pixel Enterprise', end: false },
] as const;

/** Botones de la cabecera sobre el video (siempre claros, sea cual sea el tema). */
const MEDIA_GHOST =
  'items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-blanco transition-colors hover:bg-blanco/10';

/**
 * Cabecera de las páginas públicas.
 * - `media`: transparente sobre el video de la bienvenida (logo y textos para fondo oscuro).
 * - `page`: fija sobre el fondo de la interfaz, con la navegación de Explorar.
 * Visitantes: "Iniciar sesión" y "Crear cuenta" abren el modal. Con sesión: acceso a sus Pixels y
 * el menú de usuario de la app.
 */
export function PublicHeader({ tone }: { tone: 'media' | 'page' }) {
  const media = tone === 'media';
  return (
    <header
      className={media ? 'relative z-10' : 'sticky top-0 z-30 border-b border-line bg-canvas'}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0 rounded-lg" aria-label="Pixel · inicio">
          {/* En móvil, el isotipo (mínimo 24 px); desde `sm`, el logotipo completo. */}
          <span className="flex sm:hidden">
            <BrandLogo variant="isotipo" height={28} onDark={media} decorative />
          </span>
          <span className="hidden sm:flex">
            <BrandLogo height={28} onDark={media} decorative />
          </span>
        </Link>

        {!media && (
          <nav aria-label="Explorar Pixel" className="hidden lg:block">
            <ExploreNavLinks />
          </nav>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2">
          {media && (
            <Link to="/explore" className={`hidden sm:inline-flex ${MEDIA_GHOST}`}>
              Explorar
            </Link>
          )}
          <AccountActions media={media} />
        </div>
      </div>

      {!media && (
        <nav
          aria-label="Explorar Pixel"
          className="border-t border-line px-4 py-2 sm:px-6 lg:hidden"
        >
          <ExploreNavLinks />
        </nav>
      )}
    </header>
  );
}

function ExploreNavLinks() {
  return (
    <ul className="-mx-1 flex items-center gap-0.5 overflow-x-auto sm:gap-2">
      {EXPLORE_NAV.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-2 text-sm transition-colors sm:px-2.5 ${
                isActive ? 'font-medium text-fg' : 'text-muted hover:text-fg'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Píxel señal: marca la sección activa. */}
                <span
                  className={`size-1.5 shrink-0 ${isActive ? 'bg-signal' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
                {item.label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AccountActions({ media }: { media: boolean }) {
  const { state } = useAuth();
  const { openAuth } = useAuthDialog();

  // Mientras se comprueba la sesión no se muestra nada (evita parpadeos de botones).
  if (state.status === 'loading') return <span className="h-9 w-40" aria-hidden="true" />;

  if (state.status === 'authenticated') {
    return (
      <>
        <Link to="/dashboard" className={buttonClasses('secondary', 'whitespace-nowrap px-3 py-2')}>
          Mis Pixels
        </Link>
        <UserMenu />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => openAuth('login', { opener: event.currentTarget })}
        className={
          media
            ? `inline-flex ${MEDIA_GHOST}`
            : buttonClasses('ghost', 'whitespace-nowrap px-3 py-2')
        }
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        onClick={(event) => openAuth('register', { opener: event.currentTarget })}
        className={buttonClasses('primary', 'whitespace-nowrap px-3 py-2 sm:px-4')}
      >
        Crear cuenta
      </button>
    </>
  );
}
