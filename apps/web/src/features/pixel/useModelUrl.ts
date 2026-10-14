import { useEffect, useState } from 'react';
import { workspaceApiBase } from '../../lib/apiPaths';
import { getAvatarModel, modelFileUrl } from './avatarApi';

/** Por workspace y versión del avatar: la URL del .glb listo, o null (se consulta una vez). */
const cache = new Map<string, Promise<string | null>>();

function fetchModelUrl(workspaceId: string, version: number): Promise<string | null> {
  const key = `${workspaceId}:${version}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = getAvatarModel(workspaceApiBase(workspaceId))
      .then((res) => {
        const glb = res.model?.status === 'ready' ? res.model.files.glb : null;
        // Si aún no está listo, no se guarda: la próxima vez se vuelve a preguntar.
        if (!glb) cache.delete(key);
        return glb ? modelFileUrl(glb) : null;
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Modelo 3D esculpido del personaje para las superficies de presencia (Inicio, Dock). Sin modelo,
 * o mientras se consulta, null: el escenario usa el avatar paramétrico.
 */
export function useModelUrl(workspaceId: string | null, version: number | null): string | null {
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);
  const key = workspaceId && version ? `${workspaceId}:${version}` : null;

  useEffect(() => {
    if (!workspaceId || !version || !key) return;
    let alive = true;
    void fetchModelUrl(workspaceId, version).then((url) => {
      if (alive) setState({ key, url });
    });
    return () => {
      alive = false;
    };
  }, [workspaceId, version, key]);

  return state && state.key === key ? state.url : null;
}
