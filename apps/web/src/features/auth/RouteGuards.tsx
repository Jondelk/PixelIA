import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { FullScreenLoader } from '../../components/Spinner';
import { useAuth } from './authContext';
import { nextAfterAuth } from './redirect';

/** Solo usuarios autenticados. Recuerda a dónde iba el usuario para volver tras el login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <FullScreenLoader />;
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/**
 * Bienvenida, login y registro: si ya hay sesión, ir directo al destino pedido (`?next=` o el de
 * RequireAuth, solo rutas internas) o a "Tus Pixels". Así, al iniciar sesión desde el modal de la
 * bienvenida, esta redirección y la del formulario llevan al mismo sitio.
 */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  if (state.status === 'loading') return <FullScreenLoader />;
  if (state.status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={nextAfterAuth(params.get('next'), from)} replace />;
  }
  return children;
}
