import { Link } from 'react-router';
import { introVideo } from '../../brand/experience';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { BackgroundVideo } from './BackgroundVideo';
import { useAuthDialog } from './authDialogContext';
import { PublicHeader } from './PublicHeader';

/**
 * Bienvenida pública (`/`): una landing usable desde el primer instante, sin animación obligatoria.
 * El video (o su poster) va detrás de una capa sólida que garantiza la lectura en cualquier
 * fotograma. Los usuarios con sesión no llegan aquí: `/` los lleva a sus Pixels.
 */
export function WelcomePage() {
  const { openAuth, isOpen } = useAuthDialog();

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-negro-cine text-blanco">
      {/* El video se pausa mientras el modal de acceso lo tapa. */}
      <BackgroundVideo video={introVideo} suspended={isOpen} />
      <div className="absolute inset-0 bg-negro-cine/60" aria-hidden="true" />

      <PublicHeader tone="media" />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-blanco/75">
            <span className="size-2 shrink-0 bg-amarillo" aria-hidden="true" />
            Pixel · director creativo
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl">
            Tu mundo, potenciado por Pixel.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-blanco/85 sm:text-xl">
            Un espacio para tus ideas. Un sistema para tu empresa.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/explore" className={buttonClasses('primary', 'px-6 py-3 text-base')}>
              Explorar Pixel <Icon name="arrowRight" className="size-4" />
            </Link>
            <button
              type="button"
              onClick={(event) => openAuth('login', { opener: event.currentTarget })}
              className="inline-flex items-center justify-center rounded-lg border border-blanco/40 px-6 py-3 text-base font-medium text-blanco transition-colors hover:bg-blanco/10"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
