import type { ApiError } from '@pixel/contracts';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/** Errores que lanza el parser JSON de Express (body-parser). */
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

/**
 * Manejador central: todo error termina con la forma `ApiError` de contracts.
 * Los errores no controlados se registran completos y se responden genéricos.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;
    const send = (status: number, error: Omit<ApiError['error'], 'requestId'>) => {
      const body: ApiError = { error: { ...error, requestId } };
      res.status(status).json(body);
    };

    if (err instanceof AppError) {
      send(err.status, { code: err.code, message: err.message, details: err.details });
      return;
    }

    if (err instanceof ZodError) {
      send(400, {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (isBodyParserError(err)) {
      if (err.type === 'entity.parse.failed') {
        send(400, { code: 'BAD_REQUEST', message: 'El cuerpo de la petición no es JSON válido' });
        return;
      }
      if (err.type === 'entity.too.large') {
        send(413, { code: 'BAD_REQUEST', message: 'El cuerpo de la petición es demasiado grande' });
        return;
      }
    }

    logger.error('Error no controlado', { requestId, err });
    send(500, { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
  };
}
