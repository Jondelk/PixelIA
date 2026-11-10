import { randomBytes } from 'node:crypto';
import { GeneratedWeekPlanningSchema } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import {
  WEEK_PLANNING_SCHEMA_NAME,
  WEEK_PLANNING_SYSTEM,
  weekPlanningPrompt,
} from '../src/ai/index.js';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';
import { createGoogleCalendarProvider } from '../src/modules/calendar/google.provider.js';

/*
 * Prompt 19 en vivo. Ambos bloques quedan SKIPPED si falta su configuración (cuestan dinero o
 * necesitan una cuenta real). Las equivalentes con el Google falso y el proveedor demo corren
 * siempre en googleCalendar.test.ts y weekPlanner.unit.test.ts.
 *
 * Google: SOLO contra un calendario de PRUEBA dedicado (GOOGLE_CALENDAR_TEST_CALENDAR_ID, nunca
 * «primary») y con un refresh token de prueba en GOOGLE_CALENDAR_TEST_REFRESH_TOKEN (variable de
 * entorno del proceso de test, nunca en el repo). Crea un evento en 2030 con un id aleatorio y lo
 * mueve; no se borra nada (Pixel no tiene delete_event).
 */

const testCalendar = process.env.GOOGLE_CALENDAR_TEST_CALENDAR_ID;
const liveGoogle = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALENDAR_TEST_REFRESH_TOKEN &&
  testCalendar &&
  testCalendar !== 'primary',
);

describe.skipIf(!liveGoogle)('Google Calendar real (calendario de prueba)', () => {
  it(
    'renueva el token, crea con id determinista, detecta el duplicado, relee y mueve',
    { timeout: 60_000 },
    async () => {
      const provider = createGoogleCalendarProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri:
          process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
          'http://localhost:5173/api/calendar/google/callback',
        encryptionKey: randomBytes(32),
      });
      const { accessToken } = await provider.refreshAccessToken(
        process.env.GOOGLE_CALENDAR_TEST_REFRESH_TOKEN!,
      );
      const id = randomBytes(16).toString('hex');
      const event = {
        id,
        summary: 'Pixel · prueba en vivo',
        start: '2030-01-07T15:00:00.000Z',
        end: '2030-01-07T16:30:00.000Z',
        timezone: 'America/Bogota',
        description: 'Creado por el test en vivo de Pixel (calendario de prueba).',
        pixel: { workspace: 'live-test', action: 'live-test' },
      };
      const created = await provider.insertEvent(accessToken, testCalendar!, event);
      expect(created.pixel.managed).toBe(true);
      await expect(provider.insertEvent(accessToken, testCalendar!, event)).rejects.toMatchObject({
        code: 'calendar_duplicate',
      });
      const read = await provider.getEvent(accessToken, testCalendar!, id);
      expect(read?.title).toBe(event.summary);
      const busy = await provider.freeBusy(accessToken, testCalendar!, {
        start: event.start,
        end: event.end,
      });
      expect(busy.length).toBeGreaterThan(0);
      const moved = await provider.patchEvent(accessToken, testCalendar!, id, {
        start: '2030-01-09T23:00:00.000Z',
        end: '2030-01-10T00:30:00.000Z',
        timezone: 'America/Bogota',
      });
      expect(Date.parse(moved.start)).toBe(Date.parse('2030-01-09T23:00:00.000Z'));
    },
  );
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Claude real: entender la semana', () => {
  it(
    'parcial el viernes, reunión el miércoles, tres sesiones (sin inventar horas ni duraciones)',
    { timeout: 120_000 },
    async () => {
      const ai = new AnthropicProvider({
        model: process.env.AI_MODEL ?? 'claude-opus-5-5',
        timeoutMs: 120_000,
      });
      const result = await ai.generateStructuredOutput({
        system: WEEK_PLANNING_SYSTEM,
        prompt: weekPlanningPrompt({
          nowLocal: '2026-10-12T08:00:00.000-05:00',
          timezone: 'America/Bogota',
          today: 'monday',
          userRequest:
            'Organízame la semana: tengo parcial de cálculo el viernes, el miércoles tengo una reunión familiar y quiero estudiar tres veces.',
          previous: null,
        }),
        schema: GeneratedWeekPlanningSchema,
        schemaName: WEEK_PLANNING_SCHEMA_NAME,
        maxOutputTokens: 1200,
      });
      const plan = GeneratedWeekPlanningSchema.parse(result.data);
      expect(plan.sessions.reduce((sum, session) => sum + session.count, 0)).toBe(3);
      expect(plan.sessions.every((session) => session.durationMinutes === null)).toBe(true);
      expect(plan.commitments.some((c) => c.isDeadline && c.day === 'friday')).toBe(true);
      expect(
        plan.commitments.some((c) => !c.isDeadline && c.day === 'wednesday' && c.time === null),
      ).toBe(true);
    },
  );
});
