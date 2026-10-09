import type { RequestHandler } from 'express';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF complementaria a la cookie SameSite=Lax: rechaza peticiones que modifican
 * datos si llegan con un Origin que no está permitido. Sin Origin (curl, tests,
 * servidor a servidor) se permite: la cookie de sesión no viaja en esos casos desde otro sitio.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.header('origin');
    if (SAFE_METHODS.has(req.method) || !origin || allowedOrigins.includes(origin)) {
      next();
      return;
    }
    next(forbidden('Origen no permitido'));
  };
}
