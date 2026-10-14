import type { DatabaseStatus } from '@pixel/contracts';
import mongoose from 'mongoose';
import type { Logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);

let stopped = false;
let wasConnected = false;
let retryTimer: NodeJS.Timeout | undefined;
/**
 * Prompt 18: la base solo está LISTA cuando, además de conectada, superó el mantenimiento crítico
 * (los índices de los que depende la integridad). Hasta entonces se informa `connecting` y la API
 * no atiende tráfico normal (compuerta en app.ts).
 */
let criticalReady = false;

export function getDatabaseStatus(): DatabaseStatus {
  switch (mongoose.connection.readyState) {
    case mongoose.ConnectionStates.connected:
      return criticalReady ? 'connected' : 'connecting';
    case mongoose.ConnectionStates.connecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

/**
 * Conecta a MongoDB sin bloquear el arranque de la API: si la base no está
 * disponible se reintenta cada `retryDelayMs` y /api/health reporta "degraded".
 * Tras la primera conexión:
 * - `critical` (Prompt 18): mantenimiento del que depende la integridad (índices únicos). Hasta que
 *   termina bien la base no está lista; si falla, la API NO queda operativa: se llama a
 *   `onCriticalFailure` (el servidor registra el error y termina el proceso).
 * - `onConnected`: mantenimiento idempotente no crítico (migraciones perezosas…); si falla se
 *   registra y la API sigue en marcha.
 */
export function startDatabase(
  uri: string,
  logger: Logger,
  options: {
    retryDelayMs?: number;
    critical?: () => Promise<unknown>;
    onCriticalFailure?: (err: unknown) => void;
    onConnected?: () => Promise<void>;
  } = {},
): void {
  const retryDelayMs = options.retryDelayMs ?? 5000;
  stopped = false;
  criticalReady = !options.critical;

  mongoose.connection.on('connected', () => {
    wasConnected = true;
  });
  // Solo avisa si se pierde una conexión establecida (no en cada reintento fallido).
  mongoose.connection.on('disconnected', () => {
    if (wasConnected && !stopped) logger.warn('MongoDB desconectado');
  });
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconectado'));

  const attempt = async () => {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info('MongoDB conectado', {
        host: mongoose.connection.host,
        db: mongoose.connection.name,
      });
      if (options.critical) {
        const ok = await runCriticalMaintenance(options.critical, options.onCriticalFailure);
        if (!ok) return;
      }
      await options
        .onConnected?.()
        .catch((err: unknown) =>
          logger.error('Falló el mantenimiento de la base de datos al conectar', { err }),
        );
    } catch (err) {
      if (stopped) return;
      logger.warn(`No se pudo conectar a MongoDB; reintento en ${retryDelayMs / 1000}s`, {
        reason: err instanceof Error ? err.message : String(err),
      });
      retryTimer = setTimeout(() => void attempt(), retryDelayMs);
    }
  };

  void attempt();
}

/**
 * Ejecuta el mantenimiento crítico: si termina bien, la base queda lista; si falla, sigue sin estar
 * lista (la compuerta rechaza el tráfico) y se avisa para que el proceso termine.
 */
export async function runCriticalMaintenance(
  critical: () => Promise<unknown>,
  onFailure?: (err: unknown) => void,
): Promise<boolean> {
  criticalReady = false;
  try {
    await critical();
    criticalReady = true;
    return true;
  } catch (err) {
    onFailure?.(err);
    return false;
  }
}

export async function stopDatabase(): Promise<void> {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  await mongoose.disconnect();
}
