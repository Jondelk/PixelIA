import type { DatabaseStatus } from '@pixel/contracts';
import mongoose from 'mongoose';
import type { Logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);

let stopped = false;
let wasConnected = false;
let retryTimer: NodeJS.Timeout | undefined;

export function getDatabaseStatus(): DatabaseStatus {
  switch (mongoose.connection.readyState) {
    case mongoose.ConnectionStates.connected:
      return 'connected';
    case mongoose.ConnectionStates.connecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

/**
 * Conecta a MongoDB sin bloquear el arranque de la API: si la base no está
 * disponible se reintenta cada `retryDelayMs` y /api/health reporta "degraded".
 */
export function startDatabase(uri: string, logger: Logger, retryDelayMs = 5000): void {
  stopped = false;

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

export async function stopDatabase(): Promise<void> {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  await mongoose.disconnect();
}
