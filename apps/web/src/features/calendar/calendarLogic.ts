import type { CalendarConnectionStatus, WeekPlanBlock, WeekPlanView } from '@pixel/contracts';

/*
 * Lógica pura de Google Calendar en la web (Prompt 19, sin React): textos de cada estado, el
 * resultado de volver de Google (`?calendar=`) y el plan agrupado por día.
 */

export const CALENDAR_PRIVACY =
  'Pixel solo lee tu disponibilidad y tus eventos para planificar a su alrededor, y solo guarda o mueve los bloques que tú apruebes. No borra eventos ni copia tu calendario. Puedes desconectarlo cuando quieras.';

export const CALENDAR_STATUS_TEXT: Record<CalendarConnectionStatus, string> = {
  unconfigured: 'Google Calendar todavía no está configurado en esta instalación de Pixel.',
  requires_auth:
    'Conecta tu Google Calendar para que Pixel planifique tu semana con tu disponibilidad real.',
  connected:
    'Conectado. Pixel puede consultar tu disponibilidad y guardar los bloques que apruebes.',
  requires_reauth: 'Necesito volver a conectar tu Google Calendar.',
  unavailable: 'Google Calendar no responde ahora mismo. Inténtalo en un momento.',
};

/** ¿Se puede ofrecer conectar? (sin credenciales en la instalación, no hay OAuth que ofrecer). */
export function connectLabel(status: CalendarConnectionStatus): string | null {
  if (status === 'requires_auth') return 'Conectar Google Calendar';
  if (status === 'requires_reauth') return 'Volver a conectar';
  return null;
}

const RETURN_ERRORS: Record<string, string> = {
  denied: 'No se conectó: no diste permiso en Google. Puedes intentarlo cuando quieras.',
  state_invalid: 'No pude comprobar la conexión con Google. Vuelve a intentarlo desde Pixel.',
  state_expired: 'La conexión tardó demasiado y caducó por seguridad. Vuelve a intentarlo.',
  state_replayed: 'Ese enlace de conexión ya se usó. Vuelve a intentarlo desde Pixel.',
  session_mismatch: 'La conexión no corresponde a tu sesión. Inicia sesión y vuelve a intentarlo.',
  workspace_invalid: 'Ese Pixel no admite Google Calendar.',
  exchange_failed: 'Google no completó la conexión. Vuelve a intentarlo en un momento.',
  missing_refresh_token:
    'Google no dio un acceso duradero. Quita a Pixel de los permisos de tu cuenta de Google y vuelve a conectar.',
  insufficient_scope:
    'Faltan permisos: para planificar, Pixel necesita ver tu disponibilidad y guardar bloques. Vuelve a conectar y acepta todos.',
  unconfigured: 'Google Calendar todavía no está configurado en esta instalación de Pixel.',
};

/** Mensaje al volver de Google (null si la URL no trae resultado). */
export function calendarReturnMessage(
  params: URLSearchParams,
): { tone: 'success' | 'error'; text: string } | null {
  const result = params.get('calendar');
  if (result === 'connected') {
    return {
      tone: 'success',
      text: 'Google Calendar conectado. Ya puedes pedirle a Pixel que organice tu semana.',
    };
  }
  if (result === 'error') {
    const reason = params.get('reason') ?? '';
    return {
      tone: 'error',
      text: RETURN_ERRORS[reason] ?? 'No se pudo conectar Google Calendar. Vuelve a intentarlo.',
    };
  }
  return null;
}

export interface WeekPlanDay {
  label: string;
  blocks: WeekPlanBlock[];
}

/** Bloques agrupados por día (en el orden del plan). */
export function groupBlocksByDay(plan: Pick<WeekPlanView, 'blocks'>): WeekPlanDay[] {
  const days: WeekPlanDay[] = [];
  for (const block of [...plan.blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const last = days.at(-1);
    if (last && last.label === block.dayLabel) last.blocks.push(block);
    else days.push({ label: block.dayLabel, blocks: [block] });
  }
  return days;
}
