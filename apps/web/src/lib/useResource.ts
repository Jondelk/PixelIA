import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type ResourceState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: unknown };

/**
 * Carga datos asociados a una clave (p. ej. el companyId). Si la clave cambia, vuelve a
 * cargar y nunca muestra datos de la clave anterior. Cancela peticiones obsoletas.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ id: string; state: ResourceState<T> } | null>(null);
  const runLoad = useEffectEvent(load);
  const id = `${key}#${version}`;

  useEffect(() => {
    const controller = new AbortController();
    runLoad(controller.signal).then(
      (data) => setResult({ id, state: { status: 'success', data } }),
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ id, state: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [id]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const state: ResourceState<T> = result?.id === id ? result.state : { status: 'loading' };
  return { state, reload };
}
