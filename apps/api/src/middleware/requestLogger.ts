import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

/**
 * Rutas cuya query lleva secretos de un solo uso (el `code` y el `state` de OAuth, Prompt 19):
 * se registran sin query.
 */
const SECRET_QUERY_PATHS = ['/api/calendar/'];

export function loggablePath(url: string): string {
  const [path] = url.split('?');
  return SECRET_QUERY_PATHS.some((prefix) => path!.startsWith(prefix)) ? path! : url;
}

/** Asigna un requestId (propagable vía X-Request-Id) y registra cada petición al terminar. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const path = loggablePath(req.originalUrl);
      const meta = {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      };
      const message = `${req.method} ${path} ${res.statusCode}`;
      // El health check se consulta con frecuencia y su 503 es un estado esperado: solo en debug.
      if (req.originalUrl.startsWith('/api/health')) logger.debug(message, meta);
      else if (res.statusCode >= 500) logger.error(message, meta);
      else logger.info(message, meta);
    });

    next();
  };
}
