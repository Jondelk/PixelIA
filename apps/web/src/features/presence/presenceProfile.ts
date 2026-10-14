import type { AvatarPreview } from '@pixel/contracts';

/*
 * Perfiles de presencia derivados del personaje (que a su vez sale del ADN): no son una entidad
 * nueva. VoiceProfile describe características OPERACIONALES que el proveedor actual puede cumplir
 * (idioma, ritmo, voz disponible): nunca clonación ni "la voz de X". BehaviorProfile prepara que
 * cada Pixel no se mueva igual (TINTO pausado, INVENTIA más activo) sin animaciones nuevas.
 */

export interface VoiceProfile {
  language: string;
  /** Velocidad de habla (0.85–1.15). */
  pace: number;
  energy: number;
}

export interface BehaviorProfile {
  movementEnergy: number;
  gestureIntensity: number;
  idleTempo: number;
  responsePace: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function voiceProfileOf(avatar: AvatarPreview | null, language = 'es-ES'): VoiceProfile {
  const energy = avatar?.idleBehavior.energy ?? 0.5;
  return { language, pace: Math.round(clamp(0.9 + energy * 0.2, 0.85, 1.15) * 100) / 100, energy };
}

export function behaviorProfileOf(avatar: AvatarPreview | null): BehaviorProfile {
  const energy = avatar?.idleBehavior.energy ?? 0.5;
  return {
    movementEnergy: energy,
    gestureIntensity: clamp(0.3 + energy * 0.6, 0, 1),
    idleTempo: clamp(0.6 + energy * 0.8, 0.5, 1.4),
    responsePace: clamp(0.8 + energy * 0.4, 0.8, 1.2),
  };
}

/* ---------- Preferencias (por dispositivo) ---------- */

/**
 * Preferencias de voz y movimiento POR DISPOSITIVO y por Pixel: las voces disponibles dependen del
 * navegador, así que se guardan en este navegador (localStorage, con try/catch), no en Mongo. Si el
 * almacenamiento no está disponible, se usan los valores por defecto.
 */
export interface PresencePreferences {
  voiceEnabled: boolean;
  /** Hablar las respuestas mientras dura una sesión de voz (iniciada con el micrófono). */
  autoSpeak: boolean;
  voiceId: string | null;
  /** null = el ritmo del perfil de voz del Pixel. */
  rate: number | null;
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: PresencePreferences = {
  voiceEnabled: true,
  autoSpeak: true,
  voiceId: null,
  rate: null,
  reduceMotion: false,
};

const key = (workspaceId: string) => `pixel:presence:${workspaceId}`;

export function loadPreferences(workspaceId: string | null): PresencePreferences {
  if (!workspaceId) return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(key(workspaceId));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PresencePreferences>;
    return {
      voiceEnabled: parsed.voiceEnabled !== false,
      autoSpeak: parsed.autoSpeak !== false,
      voiceId: typeof parsed.voiceId === 'string' ? parsed.voiceId : null,
      rate: typeof parsed.rate === 'number' ? clamp(parsed.rate, 0.7, 1.3) : null,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/* ---------- Aviso de privacidad de la voz (por dispositivo) ---------- */

/** Se muestra la primera vez que se activa el micrófono y queda en «Voz y movimiento». */
export const VOICE_PRIVACY_NOTICE =
  'Pixel utiliza las funciones de reconocimiento de voz disponibles en tu navegador. Dependiendo del navegador, el audio puede ser procesado por su proveedor. Pixel no almacena el audio.';

/** Por dispositivo, no por Pixel: el aviso habla del navegador. */
const VOICE_NOTICE_KEY = 'pixel:voice-notice';
/** Sin almacenamiento (modo privado, bloqueado), el aviso no se repite en esta sesión. */
let voiceNoticeSeenThisSession = false;

export function voiceNoticeSeen(): boolean {
  if (voiceNoticeSeenThisSession) return true;
  try {
    return window.localStorage.getItem(VOICE_NOTICE_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markVoiceNoticeSeen(): void {
  voiceNoticeSeenThisSession = true;
  try {
    window.localStorage.setItem(VOICE_NOTICE_KEY, 'seen');
  } catch {
    // Vale para esta sesión.
  }
}

export function savePreferences(workspaceId: string, preferences: PresencePreferences): void {
  try {
    window.localStorage.setItem(key(workspaceId), JSON.stringify(preferences));
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): la preferencia dura la sesión.
  }
}
