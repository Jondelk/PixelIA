import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, setUnauthorizedHandler } from '../../lib/api';
import { fetchCurrentUser, loginRequest, logoutRequest, registerRequest } from './authApi';
import { AuthContext, type AuthContextValue, type AuthState } from './authContext';

/** Sesión del usuario. La cookie httpOnly la gestiona el navegador; aquí solo el estado. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentUser(controller.signal).then(
      (user) => setState({ status: 'authenticated', user }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        if (!(err instanceof ApiRequestError) || err.status !== 401) {
          console.warn('No se pudo comprobar la sesión', err);
        }
        setState({ status: 'anonymous' });
      },
    );
    return () => controller.abort();
  }, []);

  // Si cualquier petición protegida responde 401, la sesión expiró: volver al login.
  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'anonymous' }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (input) => {
    const user = await loginRequest(input);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const user = await registerRequest(input);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo(
    () => ({ state, login, register, logout }),
    [state, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
