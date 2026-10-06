import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullScreenLoader } from '../../components/Spinner';
import { useAuth } from './authContext';

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

/** Login y registro: si ya hay sesión, ir directo al dashboard. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullScreenLoader />;
  if (state.status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return children;
}
