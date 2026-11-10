import type { AvatarState } from '../avatar3d/pose';

/*
 * Pixel Presence (Prompt 17, docs/PIXEL-PRESENCE.md): el estado visible de Pixel, compartido por
 * toda la interfaz de un workspace. Es EFÍMERO (nunca se guarda en Mongo) y se mueve solo por eventos
 * (think, listen, speak, review, success, warn, fail, idle): ninguna pantalla manipula clases a mano.
 *
 * "Pixel should feel present, not merely available."
 */

export const PRESENCE_STATES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'reviewing',
  'success',
  'warning',
  'error',
] as const;
export type PixelPresenceState = (typeof PRESENCE_STATES)[number];

export type PresenceEvent =
  'idle' | 'listen' | 'think' | 'speak' | 'review' | 'success' | 'warn' | 'fail';

const TARGET: Record<PresenceEvent, PixelPresenceState> = {
  idle: 'idle',
  listen: 'listening',
  think: 'thinking',
  speak: 'speaking',
  review: 'reviewing',
  success: 'success',
  warn: 'warning',
  fail: 'error',
};

/** Transiciones permitidas. Cualquier estado puede volver a idle o fallar (nunca queda colgado). */
const ALLOWED: Record<PixelPresenceState, readonly PixelPresenceState[]> = {
  idle: ['listening', 'thinking', 'reviewing', 'speaking', 'success', 'warning', 'error'],
  listening: ['thinking', 'idle', 'error'],
  thinking: ['reviewing', 'speaking', 'success', 'warning', 'error', 'idle'],
  // reviewing → thinking: la corrección de una pasada del Guardian.
  reviewing: ['thinking', 'speaking', 'success', 'warning', 'error', 'idle'],
  speaking: ['idle', 'listening', 'thinking', 'error'],
  success: ['idle', 'listening', 'thinking', 'speaking', 'reviewing'],
  warning: ['idle', 'listening', 'thinking', 'speaking', 'reviewing'],
  error: ['idle', 'listening', 'thinking', 'reviewing'],
};

/** Siguiente estado (puro). Una transición no permitida deja el estado como estaba. */
export function transition(state: PixelPresenceState, event: PresenceEvent): PixelPresenceState {
  const target = TARGET[event];
  if (target === state) return state;
  return ALLOWED[state].includes(target) ? target : state;
}

/** Estados transitorios: vuelven solos a idle tras este tiempo (ms). */
export const TRANSIENT_MS: Partial<Record<PixelPresenceState, number>> = {
  success: 2400,
  warning: 3600,
  error: 3600,
};

/** Texto honesto del estado (aria-live y chip de la topbar): nunca un porcentaje inventado. */
export const PRESENCE_LABELS: Record<PixelPresenceState, string> = {
  idle: 'Pixel listo',
  listening: 'Escuchando…',
  thinking: 'Pensando…',
  speaking: 'Hablando…',
  reviewing: 'Revisando…',
  success: 'Listo',
  warning: 'Requiere tu atención',
  error: 'Algo no salió bien',
};

/**
 * Estado → pose del avatar procedural actual. Las poses existentes son idle, thinking, listening,
 * speaking y happy: lo que no tiene pose propia usa la más cercana (nunca se inventa un asset).
 */
export function avatarStateFor(state: PixelPresenceState): AvatarState {
  switch (state) {
    case 'listening':
      return 'listening';
    case 'thinking':
    case 'reviewing':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'success':
      return 'happy';
    default:
      return 'idle';
  }
}

/**
 * Contrato de clips para avatares GLB (docs/AVATAR-ASSET-CONTRACT.md): el primero disponible gana;
 * si ninguno existe, null = pose procedural. Hoy ningún avatar trae clips.
 */
export const CLIP_PREFERENCES: Record<PixelPresenceState, readonly string[]> = {
  idle: ['Idle'],
  listening: ['Listening', 'Idle'],
  thinking: ['Thinking', 'Idle'],
  speaking: ['Speaking', 'Explaining', 'Idle'],
  reviewing: ['Reviewing', 'Thinking', 'Idle'],
  success: ['Success', 'Celebrating', 'Agree', 'Idle'],
  warning: ['Warning', 'Concerned', 'Idle'],
  error: ['Concerned', 'Warning', 'Idle'],
};

export function resolveClip(
  state: PixelPresenceState,
  available: readonly string[],
): string | null {
  return CLIP_PREFERENCES[state].find((clip) => available.includes(clip)) ?? null;
}

/* ---------- Reglas del proveedor (puras, testeables) ---------- */

/**
 * ¿Hay que decir esto en voz alta? Solo dentro de una sesión de voz (iniciada con el micrófono), con
 * la voz activada, «hablar en sesiones de voz» activado y un TTS disponible. Devuelve la versión
 * hablada (corta) o null: Pixel nunca habla al abrir una pantalla.
 */
export function speechFor(
  spoken: string | null,
  options: {
    voiceSession: boolean;
    voiceEnabled: boolean;
    autoSpeak: boolean;
    outputSupported: boolean;
  },
): string | null {
  if (!spoken) return null;
  const { voiceSession, voiceEnabled, autoSpeak, outputSupported } = options;
  return voiceSession && voiceEnabled && autoSpeak && outputSupported ? spoken : null;
}

/**
 * ¿Cambiar de ámbito obliga a callar y cerrar el micrófono? Sí cuando cambia el Pixel (o se sale de
 * él): TINTO nunca sigue hablando dentro de INVENTIA. Re-ligar el mismo Pixel no corta nada.
 */
export function scopeSwitchStopsVoice(
  previous: { workspaceId: string } | null,
  next: { workspaceId: string } | null,
): boolean {
  return previous?.workspaceId !== next?.workspaceId;
}
