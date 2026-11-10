import { safeNextPath } from '../auth/redirect';

/*
 * Bienvenida audiovisual de PIXELES antes del acceso: se ve al entrar desde una sesión pública NUEVA
 * del navegador (pestaña o ventana) y no vuelve a interponerse en esa sesión. Sin preferencias ni
 * cuentas: solo un indicador en sessionStorage, que se borra al cerrar la pestaña. Si el navegador
 * bloquea el almacenamiento, la bienvenida se trata como ya vista (nunca un bucle).
 */

const KEY = 'pixel.intro.seen';

export function introSeen(storage: Pick<Storage, 'getItem'> | null = sessionStore()): boolean {
  try {
    return !storage || storage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(storage: Pick<Storage, 'setItem'> | null = sessionStore()): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    // Sin almacenamiento: no pasa nada (introSeen ya lo trata como vista).
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** La bienvenida conservando a dónde iba el visitante (solo rutas internas). */
export function introPath(from: string | null | undefined): string {
  const next = safeNextPath(from);
  return next && next !== '/' ? `/?next=${encodeURIComponent(next)}` : '/';
}

/**
 * A dónde va un visitante sin sesión que intentó abrir una ruta privada: la bienvenida la primera
 * vez en esta sesión del navegador; después, directo al login. Nunca un bucle login → bienvenida.
 */
export function anonymousEntry(from: string, seen: boolean): string {
  return seen ? '/login' : introPath(from);
}
