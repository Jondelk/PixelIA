import cors from 'cors';
import express, { type Express } from 'express';
import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter, type ApiDependencies } from './modules/index.js';

export interface AppOptions extends ApiDependencies {
  env: Pick<Env, 'CORS_ORIGINS'>;
  logger: Logger;
}

/** Construye la app Express sin efectos secundarios (sin listen ni conexión a DB): usable en tests. */
export function createApp({ env, logger, ...deps }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger(logger));
  app.use(
    cors({
      origin: (origin, callback) => {
        // Sin Origin: curl, health checks o peticiones del mismo origen (proxy de Vite).
        callback(null, !origin || env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', createApiRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
