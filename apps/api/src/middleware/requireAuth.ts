import type { Request, RequestHandler } from 'express';
import { unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE, verifySessionToken, type SessionConfig } from '../modules/auth/session.js';

/** Exige una sesión válida (cookie httpOnly con JWT) y expone `req.auth.userId`. */
export function requireAuth(config: SessionConfig): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const userId = typeof token === 'string' ? verifySessionToken(token, config) : null;
    if (!userId) {
      next(unauthorized('Inicia sesión para continuar'));
      return;
    }
    req.auth = { userId };
    next();
  };
}

/** Acceso tipado al usuario autenticado dentro de rutas protegidas por requireAuth. */
export function getAuth(req: Request): { userId: string } {
  if (!req.auth) throw unauthorized('Inicia sesión para continuar');
  return req.auth;
}
