/**
 * Destinos tras iniciar sesión o crear cuenta. Solo se aceptan rutas internas de la app: nunca una
 * URL externa, un protocolo (`javascript:`…) ni una ruta "protocol-relative" (`//otro-sitio`).
 */

export const DEFAULT_AFTER_AUTH = '/dashboard';

const BASE = 'https://pixel.invalid';

/** Devuelve `raw` como ruta interna segura (path + query + hash) o `null` si no lo es. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  // Debe empezar por una sola barra: descarta "//host", "/\host", URLs absolutas y vacíos.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // Sin caracteres de control (p. ej. saltos de línea o tabuladores que el navegador ignora).
  if ([...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Primer destino seguro de la lista, o el destino por defecto. */
export function nextAfterAuth(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const safe = safeNextPath(candidate);
    if (safe) return safe;
  }
  return DEFAULT_AFTER_AUTH;
}

export type AuthMode = 'login' | 'register';

/** Ruta de la página de acceso (alternativa al modal) conservando el destino. */
export function authPagePath(mode: AuthMode, next?: string | null): string {
  const path = mode === 'login' ? '/login' : '/register';
  const safe = safeNextPath(next);
  return safe && safe !== DEFAULT_AFTER_AUTH ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
