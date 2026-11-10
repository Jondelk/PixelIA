import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { introVideo } from '../../brand/experience';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { authPagePath, safeNextPath } from '../auth/redirect';
import { BackgroundVideo } from './BackgroundVideo';
import { useAuthDialog } from './authDialogContext';
import { markIntroSeen } from './introSession';
import { PublicHeader } from './PublicHeader';

/**
 * Bienvenida audiovisual de PIXELES (`/`), antes del acceso: video a pantalla completa (o su poster),
 * la frase de marca y «Entrar a Pixel», disponible desde el primer instante (no hay que esperar al
 * video). Lleva al login conservando a dónde iba el visitante. Los usuarios con sesión no llegan
 * aquí: `/` los lleva a sus Pixels.
 */
export function WelcomePage() {
  const { isOpen } = useAuthDialog();
  const [params] = useSearchParams();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const next = safeNextPath(params.get('next')) ?? safeNextPath(from);

  // Vista en esta sesión del navegador: no vuelve a interponerse antes del login.
  useEffect(() => markIntroSeen(), []);

  return <WelcomeView loginPath={authPagePath('login', next)} suspended={isOpen} />;
}

/** Vista sin estado (testeable). */
export function WelcomeView({
  loginPath,
  suspended = false,
  video = introVideo,
}: {
  loginPath: string;
  suspended?: boolean;
  video?: typeof introVideo;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-negro-cine text-blanco">
      {/* El video (o el poster, su respaldo) es el protagonista; se pausa si el modal lo tapa. */}
      <BackgroundVideo video={video} suspended={suspended} />
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
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to={loginPath} className={buttonClasses('primary', 'px-6 py-3 text-base')}>
              Entrar a Pixel <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link
              to="/explore"
              className="text-sm font-medium text-blanco/80 underline-offset-4 transition-colors hover:text-blanco hover:underline"
            >
              Explorar Pixel
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
