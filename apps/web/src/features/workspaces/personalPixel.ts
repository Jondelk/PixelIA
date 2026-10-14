import type { User } from '@pixel/contracts';
import { ApiRequestError } from '../../lib/api';
import { createWorkspace, listWorkspaces } from './workspacesApi';

/** Nombre inicial del Pixel Personal: el del usuario, o uno genérico si es demasiado corto. */
export function personalPixelName(user: Pick<User, 'name'>): string {
  const name = user.name.trim();
  return name.length >= 2 ? name : 'Mi Pixel Personal';
}

/**
 * Crea el Pixel Personal del usuario y devuelve su id. Si ya existía (p. ej. creado en otra pestaña,
 * la API responde 409) devuelve el existente en lugar de fallar.
 */
export async function openOrCreatePersonalPixel(user: Pick<User, 'name'>): Promise<string> {
  try {
    const { workspace } = await createWorkspace({
      type: 'personal',
      name: personalPixelName(user),
    });
    return workspace.id;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 409) {
      const existing = (await listWorkspaces()).find((item) => item.workspace.type === 'personal');
      if (existing) return existing.workspace.id;
    }
    throw err;
  }
}
