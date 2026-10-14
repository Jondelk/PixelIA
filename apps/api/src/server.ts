import 'dotenv/config';
import { createAIProvider } from './ai/index.js';
import { createApp } from './app.js';
import { loadEnv, SERVICE_NAME, SERVICE_VERSION } from './config/env.js';
import { getDatabaseStatus, startDatabase, stopDatabase } from './db/connection.js';
import { createLogger } from './lib/logger.js';
import { upgradeAvatarProfileIndexes } from './modules/avatars/avatarProfile.indexes.js';
import { migrateContentPlanContexts } from './modules/content-plans/contentPlan.migration.js';
import { migrateLegacyCreativeMemories } from './modules/creative-memory/creativeMemory.migration.js';
import {
  ACTION_KEY_INDEX,
  ActionKeyIndexError,
  ensureActionKeyIndexes,
} from './modules/operations/operations.indexes.js';

const env = loadEnv();
const logger = createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production' ? 'json' : 'pretty',
});

if (env.usingDevJwtSecret) {
  logger.warn('JWT_SECRET no definido: usando un secreto de desarrollo. Defínelo en apps/api/.env');
}

startDatabase(env.MONGODB_URI, logger, {
  // Prompt 18: crítico. Sin los índices de idempotencia, Action Foundation no puede garantizar
  // «una acción = un recurso»: hasta que quedan bien la API responde 503 (salvo /api/health) y, si
  // no se pueden garantizar, el proceso termina (fail closed). Igual en todos los entornos.
  critical: async () => {
    const repaired = await ensureActionKeyIndexes();
    if (repaired.length) {
      logger.warn(`Índice ${ACTION_KEY_INDEX} reparado (configuración distinta)`, { repaired });
    }
  },
  onCriticalFailure: (err) => {
    logger.error(
      'FATAL: índices de idempotencia de Action Foundation no garantizados; la API no se inicia',
      {
        index: ACTION_KEY_INDEX,
        collection: err instanceof ActionKeyIndexError ? err.collection : 'projects/tasks',
        reason: err instanceof Error ? err.message : String(err),
      },
    );
    void shutdown('fallo de índices críticos', 1);
  },
  onConnected: async () => {
    // Índices de AvatarProfile compatibles con avatares personales (idempotente, sin tocar datos).
    const dropped = await upgradeAvatarProfileIndexes();
    if (dropped.length) logger.info('Índices legacy de avatar_profiles retirados', { dropped });
    // contextType de los planes anteriores al Prompt 14 (idempotente; sin cambios si ya está).
    const plans = await migrateContentPlanContexts();
    if (plans.migrated || plans.orphaned)
      logger.info('ContentPlan: contextType asignado', { ...plans });
    // Memorias anteriores al Prompt 16 → legacy (idempotente; fuera del retrieval, nunca se borran).
    const memories = await migrateLegacyCreativeMemories();
    if (memories.migrated)
      logger.info('CreativeMemory: memorias anteriores marcadas legacy', { ...memories });
  },
});

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
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Recibido ${signal}; cerrando...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close();
  await stopDatabase().catch((err: unknown) => logger.error('Error al cerrar MongoDB', { err }));
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) =>
  logger.error('Promesa rechazada sin manejar', { reason }),
);
