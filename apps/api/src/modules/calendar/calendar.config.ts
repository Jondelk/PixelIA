import type { Env } from '../../config/env.js';
import { parseSecretKey } from '../../lib/secretBox.js';

/**
 * Configuración de Google Calendar en esta instalación (Prompt 19). Opcional: si falta algo, la
 * herramienta queda «sin configurar» y Pixel no ofrece un OAuth que no puede funcionar. Nunca
 * impide arrancar la API. `problem` explica qué falta (sin valores).
 */
export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export type CalendarConfigResult =
  { config: GoogleCalendarConfig; problem: null } | { config: null; problem: string | null };

export function resolveCalendarConfig(
  env: Pick<
    Env,
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
    | 'GOOGLE_CALENDAR_REDIRECT_URI'
    | 'GOOGLE_TOKEN_ENCRYPTION_KEY'
  >,
): CalendarConfigResult {
  const values = [
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALENDAR_REDIRECT_URI,
    env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  ];
  if (values.every((value) => !value)) return { config: null, problem: null };
  const missing = [
    ['GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID],
    ['GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET],
    ['GOOGLE_CALENDAR_REDIRECT_URI', env.GOOGLE_CALENDAR_REDIRECT_URI],
    ['GOOGLE_TOKEN_ENCRYPTION_KEY', env.GOOGLE_TOKEN_ENCRYPTION_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) return { config: null, problem: `faltan ${missing.join(', ')}` };
  const encryptionKey = parseSecretKey(env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!encryptionKey) {
    return { config: null, problem: 'GOOGLE_TOKEN_ENCRYPTION_KEY no son 32 bytes (base64 o hex)' };
  }
  try {
    new URL(env.GOOGLE_CALENDAR_REDIRECT_URI!);
  } catch {
    return { config: null, problem: 'GOOGLE_CALENDAR_REDIRECT_URI no es una URL' };
  }
  return {
    config: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      redirectUri: env.GOOGLE_CALENDAR_REDIRECT_URI!,
      encryptionKey,
    },
    problem: null,
  };
}
