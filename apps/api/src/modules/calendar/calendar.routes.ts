import type { CalendarConnectionResponse, StartCalendarConnectResponse } from '@pixel/contracts';
import { StartCalendarConnectSchema } from '@pixel/contracts';
import { Router, type RequestHandler } from 'express';
import { getAuth } from '../../middleware/requireAuth.js';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import { SESSION_COOKIE, verifySessionToken, type SessionConfig } from '../auth/session.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import {
  completeCalendarConnect,
  connectionView,
  disconnectCalendar,
  startCalendarConnect,
  type CalendarDeps,
} from './calendarConnection.service.js';

/*
 * Módulo calendar (Prompt 19, docs/GOOGLE-CALENDAR.md). SOLO el ciclo de vida de la conexión:
 * estado, iniciar OAuth, callback y desconectar. No hay endpoints para leer ni escribir eventos:
 * las escrituras solo ocurren por PixelActionPlan → ActionExecutor tras la confirmación.
 */

const requireCalendarFeature: RequestHandler = (req, _res, next) => {
  assertWorkspaceFeature(
    getWorkspace(req),
    'calendar',
    'Google Calendar solo está disponible en tu Pixel Personal',
  );
  next();
};

/** /api/workspaces/:workspaceId/calendar (detrás de requireWorkspaceAccess). */
export function createCalendarRouter(deps: CalendarDeps): Router {
  const router = Router({ mergeParams: true });
  router.use(requireCalendarFeature);

  router.get('/connection', async (req, res) => {
    const body: CalendarConnectionResponse = {
      connection: await connectionView(getWorkspace(req), deps),
    };
    res.json(body);
  });

  router.post('/connect', async (req, res) => {
    const input = StartCalendarConnectSchema.parse(req.body ?? {});
    const body: StartCalendarConnectResponse = await startCalendarConnect(
      getWorkspace(req),
      getAuth(req).userId,
      input,
      deps,
    );
    res.json(body);
  });

  router.post('/disconnect', async (req, res) => {
    const body: CalendarConnectionResponse = {
      connection: await disconnectCalendar(getWorkspace(req), deps),
    };
    res.json(body);
  });

  return router;
}

/**
 * /api/calendar/google/callback. Google redirige aquí el navegador del usuario: la sesión se lee de
 * la cookie (SameSite=Lax viaja en esta navegación) y, si falta, se responde con una redirección
 * humana en vez de un 401. El workspace NUNCA sale de la URL: sale del estado guardado.
 */
export function createCalendarCallbackRouter(deps: CalendarDeps, session: SessionConfig): Router {
  const router = Router();
  router.get('/google/callback', async (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const userId = typeof token === 'string' ? verifySessionToken(token, session) : null;
    const target = await completeCalendarConnect(
      { state: req.query.state, code: req.query.code, error: req.query.error },
      userId,
      deps,
    );
    // El código de un solo uso no debe quedar en el historial ni salir como Referer.
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.redirect(303, target);
  });
  return router;
}
