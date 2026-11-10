import { LoginInputSchema, RegisterInputSchema, type AuthResponse } from '@pixel/contracts';
import { Router } from 'express';
import { unauthorized } from '../../lib/errors.js';
import { getAuth, requireAuth } from '../../middleware/requireAuth.js';
import type { AuthService } from './auth.service.js';
import { clearSessionCookie, setSessionCookie, type SessionConfig } from './session.js';
import { toUserDTO } from './user.model.js';

/** Módulo auth — /api/auth: registro, login, logout y sesión actual. */
export function createAuthRouter(deps: {
  authService: AuthService;
  session: SessionConfig;
}): Router {
  const { authService, session } = deps;
  const router = Router();

  router.post('/register', async (req, res) => {
    const input = RegisterInputSchema.parse(req.body);
    const user = await authService.register(input);
    setSessionCookie(res, user._id.toString(), session);
    const body: AuthResponse = { user: toUserDTO(user) };
    res.status(201).json(body);
  });

  router.post('/login', async (req, res) => {
    const input = LoginInputSchema.parse(req.body);
    const user = await authService.login(input);
    setSessionCookie(res, user._id.toString(), session);
    const body: AuthResponse = { user: toUserDTO(user) };
    res.json(body);
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, session);
    res.status(204).end();
  });

  router.get('/me', requireAuth(session), async (req, res) => {
    const user = await authService.findUserById(getAuth(req).userId);
    if (!user) {
      // El token es válido pero el usuario ya no existe: se cierra la sesión.
      clearSessionCookie(res, session);
      throw unauthorized('La sesión ya no es válida');
    }
    const body: AuthResponse = { user: toUserDTO(user) };
    res.json(body);
  });

  return router;
}
