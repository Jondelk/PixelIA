import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'pixel_session';

export interface SessionConfig {
  jwtSecret: string;
  ttlSeconds: number;
  secureCookie: boolean;
}

function cookieOptions(config: SessionConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookie,
    path: '/',
  };
}

export function createSessionToken(userId: string, config: SessionConfig): string {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    expiresIn: config.ttlSeconds,
    algorithm: 'HS256',
  });
}

/** Devuelve el userId si el token es válido y no ha expirado; null en cualquier otro caso. */
export function verifySessionToken(token: string, config: SessionConfig): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string, config: SessionConfig): void {
  res.cookie(SESSION_COOKIE, createSessionToken(userId, config), {
    ...cookieOptions(config),
    maxAge: config.ttlSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response, config: SessionConfig): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}
