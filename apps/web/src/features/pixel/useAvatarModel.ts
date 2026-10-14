import type { AvatarModelResponse } from '@pixel/contracts';
import { useCallback, useEffect, useState } from 'react';
import { buildAvatarModel, getAvatarModel } from './avatarApi';

/** Cada cuánto se consulta el estado mientras se esculpe el modelo. */
export const MODEL_POLL_MS = 2500;
/**
 * Justo después de generar un concepto la API encola el modelo en segundo plano: unas pocas
 * consultas extra evitan mostrar "sin modelo" en ese instante.
 */
const EMPTY_POLLS = 3;

export function isModelInProgress(data: AvatarModelResponse | null): boolean {
  return data?.model?.status === 'queued' || data?.model?.status === 'building';
}

/**
 * Estado del modelo 3D del personaje vigente. Mientras está en cola o construyéndose,
 * consulta de nuevo cada pocos segundos; cuando termina, deja de hacerlo.
 * `avatarVersion` reinicia la consulta cuando se genera un concepto nuevo.
 */
export function useAvatarModel(apiBase: string, avatarVersion: number | null) {
  const [result, setResult] = useState<{
    version: number | null;
    data: AvatarModelResponse | null;
    error: unknown;
    emptyPolls: number;
  }>({ version: null, data: null, error: null, emptyPolls: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!avatarVersion) return;
    const controller = new AbortController();
    getAvatarModel(apiBase, controller.signal).then(
      (data) =>
        setResult((prev) => ({
          version: avatarVersion,
          data,
          error: null,
          emptyPolls:
            prev.version === avatarVersion && !data.model
              ? prev.emptyPolls + 1
              : data.model
                ? 0
                : 1,
        })),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((prev) => ({ ...prev, version: avatarVersion, error }));
        }
      },
    );
    return () => controller.abort();
  }, [apiBase, avatarVersion, tick]);

  const data = result.version === avatarVersion ? result.data : null;
  const waitingForQueue = Boolean(
    data?.engine.available && !data.model && result.emptyPolls < EMPTY_POLLS,
  );
  const inProgress = isModelInProgress(data);
  const shouldPoll = inProgress || waitingForQueue;

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), MODEL_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [shouldPoll, data]);

  const build = useCallback(
    async (force = false) => {
      const next = await buildAvatarModel(apiBase, force);
      setResult({ version: avatarVersion, data: next, error: null, emptyPolls: 0 });
      return next;
    },
    [apiBase, avatarVersion],
  );

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return {
    data,
    error: result.version === avatarVersion ? result.error : null,
    inProgress,
    build,
    refresh,
  };
}
