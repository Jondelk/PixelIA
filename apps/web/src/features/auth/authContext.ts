import type { LoginInput, RegisterInput, User } from '@pixel/contracts';
import { createContext, useContext } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'authenticated'; user: User } | { status: 'anonymous' };

export interface AuthContextValue {
  state: AuthState;
  login(input: LoginInput): Promise<User>;
  register(input: RegisterInput): Promise<User>;
  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}

/** Usuario autenticado; solo válido dentro de rutas protegidas por <RequireAuth>. */
export function useCurrentUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('No hay un usuario autenticado');
  return state.user;
}
