import { createContext, useContext } from 'react';
import type { AuthMode } from '../auth/redirect';

/** Parámetros de URL del modal de acceso: `?auth=login|register&next=/ruta-interna`. */
export const AUTH_PARAM = 'auth';
export const NEXT_PARAM = 'next';

export function parseAuthMode(value: string | null): AuthMode | null {
  return value === 'login' || value === 'register' ? value : null;
}

export interface AuthDialogValue {
  /**
   * Abre el acceso como modal. `next` es la ruta interna a la que ir tras autenticarse (por defecto
   * "Tus Pixels"); `opener` recibe el foco al cerrar.
   */
  openAuth(mode: AuthMode, options?: { next?: string | null; opener?: HTMLElement | null }): void;
  /** El modal está abierto (p. ej. para pausar el video de fondo). */
  isOpen: boolean;
}

export const AuthDialogContext = createContext<AuthDialogValue | null>(null);

export function useAuthDialog(): AuthDialogValue {
  const value = useContext(AuthDialogContext);
  if (!value) throw new Error('useAuthDialog debe usarse dentro de <PublicLayout>');
  return value;
}
