import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type ResourceState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: unknown };

/**
 * Carga datos asociados a una clave (p. ej. el companyId).
 * - Si la clave cambia, vuelve a "loading" y nunca muestra datos de la clave anterior.
 * - `reload()` refresca en segundo plano: mantiene los datos actuales hasta que llegan los nuevos
 *   (si el estado era un error, sí vuelve a "loading").
 * - Cancela peticiones obsoletas.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    version: number;
    state: ResourceState<T>;
  } | null>(null);
  const runLoad = useEffectEvent(load);

  useEffect(() => {
    const controller = new AbortController();
    runLoad(controller.signal).then(
      (data) => setResult({ key, version, state: { status: 'success', data } }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, version, state: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [key, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  let state: ResourceState<T> = { status: 'loading' };
  if (result?.key === key) {
    const stale = result.version !== version;
    state = stale && result.state.status === 'error' ? { status: 'loading' } : result.state;
  }
  return { state, reload };
}
