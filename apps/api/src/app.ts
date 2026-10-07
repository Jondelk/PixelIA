import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { originGuard } from './middleware/originGuard.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createAuthService } from './modules/auth/auth.service.js';
import {
  createAvatarConceptEngine,
  createPersonalAvatarConceptEngine,
} from './modules/avatars/engine/index.js';
import { createApiRouter } from './modules/index.js';
import { createPersonalDnaGenerator } from './modules/personal/personalDna.generator.js';
import type { DatabaseStatus } from '@pixel/contracts';
import type { AIProvider } from './ai/index.js';

export interface AppOptions {
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'CORS_ORIGINS'
    | 'JWT_SECRET'
    | 'SESSION_TTL_DAYS'
    | 'BCRYPT_ROUNDS'
    | 'CHAT_HISTORY_LIMIT'
  >;
  logger: Logger;
  getDatabaseStatus: () => DatabaseStatus;
  /** Proveedor de IA (inyectable: en tests se usa uno falso o el demo). */
  ai: AIProvider;
}

/** Construye la app Express sin efectos secundarios (sin listen ni conexión a DB): usable en tests. */
export function createApp({ env, logger, getDatabaseStatus, ai }: AppOptions): Express {
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
  app.use(originGuard(env.CORS_ORIGINS));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    createApiRouter({
      getDatabaseStatus,
      authService: createAuthService({ bcryptRounds: env.BCRYPT_ROUNDS }),
      avatarEngine: createAvatarConceptEngine(),
      personalAvatarEngine: createPersonalAvatarConceptEngine(),
      chat: { ai, historyLimit: env.CHAT_HISTORY_LIMIT, logger },
      personalDnaGenerator: createPersonalDnaGenerator({ ai, logger }),
      session: {
        jwtSecret: env.JWT_SECRET,
        ttlSeconds: env.SESSION_TTL_DAYS * 24 * 60 * 60,
        secureCookie: env.NODE_ENV === 'production',
      },
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
