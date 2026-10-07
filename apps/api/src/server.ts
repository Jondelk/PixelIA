import 'dotenv/config';
import { createAIProvider } from './ai/index.js';
import { createApp } from './app.js';
import { loadEnv, SERVICE_NAME, SERVICE_VERSION } from './config/env.js';
import { getDatabaseStatus, startDatabase, stopDatabase } from './db/connection.js';
import { createLogger } from './lib/logger.js';

const env = loadEnv();
const logger = createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production' ? 'json' : 'pretty',
});

if (env.usingDevJwtSecret) {
  logger.warn('JWT_SECRET no definido: usando un secreto de desarrollo. Defínelo en apps/api/.env');
}

startDatabase(env.MONGODB_URI, logger);

const app = createApp({ env, logger, getDatabaseStatus, ai: createAIProvider(env, logger) });
const server = app.listen(env.PORT, () => {
  logger.info(`${SERVICE_NAME} v${SERVICE_VERSION} escuchando en http://localhost:${env.PORT}`, {
    env: env.NODE_ENV,
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  logger.error(
    err.code === 'EADDRINUSE' ? `El puerto ${env.PORT} ya está en uso` : 'Error del servidor HTTP',
    { err },
  );
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Recibido ${signal}; cerrando...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close();
  await stopDatabase().catch((err: unknown) => logger.error('Error al cerrar MongoDB', { err }));
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) =>
  logger.error('Promesa rechazada sin manejar', { reason }),
);
