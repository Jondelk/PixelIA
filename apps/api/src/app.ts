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
import { AppError } from './lib/errors.js';
import { createApiRouter } from './modules/index.js';
import { createCampaignStrategyEngine } from './modules/campaigns/campaignStrategy.engine.js';
import { createGuardianEngine } from './modules/guardian/guardian.engine.js';
import { configureCreativeMemory } from './modules/creative-memory/creativeMemory.runtime.js';
import { createPixelIntentResolver } from './modules/pixel-command/pixelIntent.resolver.js';
import { createContentPlanningEngine } from './modules/content-plans/contentPlanning.engine.js';
import { createEnterprisePlanningStrategy } from './modules/content-plans/enterprisePlanning.strategy.js';
import { createDailyDirectorEngine } from './modules/daily-director/dailyDirector.engine.js';
import { createPersonalDnaGenerator } from './modules/personal/personalDna.generator.js';
import type { DatabaseStatus } from '@pixel/contracts';
import type { AIProvider } from './ai/index.js';
import { createDefaultToolRegistry } from './modules/actions/tools/index.js';
import type { PixelToolRegistry } from './modules/actions/toolRegistry.js';
import type { CalendarDeps } from './modules/calendar/calendarConnection.service.js';

export interface AppOptions {
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'CORS_ORIGINS'
    | 'JWT_SECRET'
    | 'SESSION_TTL_DAYS'
    | 'BCRYPT_ROUNDS'
    | 'CHAT_HISTORY_LIMIT'
    | 'DEFAULT_TIMEZONE'
  >;
  logger: Logger;
  getDatabaseStatus: () => DatabaseStatus;
  /** Proveedor de IA (inyectable: en tests se usa uno falso o el demo). */
  ai: AIProvider;
  /** Herramientas de Pixel (inyectables en tests para simular fallos); por defecto, las internas. */
  tools?: PixelToolRegistry;
  /**
   * Prompt 19: Google Calendar (opcional). Sin config, la herramienta queda «sin configurar» y la
   * API arranca igual. En tests y en el smoke, un proveedor falso sin red.
   */
  calendar?: Partial<Pick<CalendarDeps, 'config' | 'provider' | 'now'>>;
}

/** Construye la app Express sin efectos secundarios (sin listen ni conexión a DB): usable en tests. */
export function createApp({
  env,
  logger,
  getDatabaseStatus,
  ai,
  tools,
  calendar: calendarOptions,
}: AppOptions): Express {
  const calendar: CalendarDeps = {
    config: calendarOptions?.config ?? null,
    provider: calendarOptions?.provider ?? null,
    logger,
    now: calendarOptions?.now ?? (() => new Date()),
  };
  const pixelTools = tools ?? createDefaultToolRegistry(calendar);
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
  // Creative Memory registra decisiones dentro de otros servicios (best-effort): logger y sintetizador.
  configureCreativeMemory({ ai, logger });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Prompt 18 (fail closed): sin la base LISTA (conectada y con sus índices críticos, ver
  // db/connection.ts) no se atiende tráfico normal; /api/health sigue respondiendo («degraded»).
  app.use('/api', (req, _res, next) => {
    if (
      req.path === '/health' ||
      req.path.startsWith('/health/') ||
      getDatabaseStatus() === 'connected'
    ) {
      next();
      return;
    }
    next(
      new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Pixel se está preparando; vuelve a intentarlo en un momento',
        {
          reason: 'database_not_ready',
        },
      ),
    );
  });

  app.use(
    '/api',
    createApiRouter({
      getDatabaseStatus,
      authService: createAuthService({ bcryptRounds: env.BCRYPT_ROUNDS }),
      avatarEngine: createAvatarConceptEngine(),
      personalAvatarEngine: createPersonalAvatarConceptEngine(),
      chat: {
        ai,
        historyLimit: env.CHAT_HISTORY_LIMIT,
        logger,
        defaultTimezone: env.DEFAULT_TIMEZONE,
      },
      personalDnaGenerator: createPersonalDnaGenerator({ ai, logger }),
      planningEngine: createContentPlanningEngine({ ai, logger }),
      enterprisePlanning: createEnterprisePlanningStrategy({ ai, logger }),
      dailyDirector: createDailyDirectorEngine({ ai, logger }),
      campaignEngine: createCampaignStrategyEngine({ ai, logger }),
      pixelIntentResolver: createPixelIntentResolver({ ai, logger }),
      pixelTools,
      calendar,
      guardianEngine: createGuardianEngine({ ai, logger }),
      defaultTimezone: env.DEFAULT_TIMEZONE,
      logger,
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
