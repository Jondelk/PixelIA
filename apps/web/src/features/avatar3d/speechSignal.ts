import { buildTimeline, REST_MOUTH, SpeechClock, type MouthShape } from './lipsync';

/*
 * Señal de habla compartida: qué está diciendo Pixel ahora y en qué punto va.
 *
 * Quien habla (la voz del navegador en Pixel Presence, o el chat cuando la respuesta aparece sin
 * voz) abre una pista con `startSpeech(text)`. Los avatares 3D leen `liveMouth()` en cada frame
 * para mover la boca; no hay renders de React por frame. Una sola pista activa: la voz real
 * tiene prioridad sobre el texto que aparece en pantalla.
 */

export type SpeechSource = 'voice' | 'text';

export interface SpeechTrack {
  readonly id: number;
  readonly source: SpeechSource;
  readonly text: string;
  readonly clock: SpeechClock;
  /** El audio empezó (la voz) o el texto empieza a aparecer. */
  begin(now?: number): void;
  /** La voz empezó la palabra que comienza en `charIndex`. */
  boundary(charIndex: number, now?: number): void;
  /** Terminó: la boca vuelve a reposo y la pista deja de estar activa. */
  end(): void;
  /** Caracteres del texto ya dichos (para mostrarlo al ritmo de la voz). */
  spokenChars(now?: number): number;
}

let active: SpeechTrack | null = null;
let nextId = 1;
const clockNow = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export function startSpeech(
  text: string,
  options: { source: SpeechSource; rate?: number },
): SpeechTrack {
  const clock = new SpeechClock(buildTimeline(text, options.rate ?? 1));
  const track: SpeechTrack = {
    id: nextId++,
    source: options.source,
    text,
    clock,
    begin: (now = clockNow()) => clock.begin(now),
    boundary: (charIndex, now = clockNow()) => clock.boundary(charIndex, now),
    end: () => {
      clock.end();
      if (active === track) active = null;
    },
    spokenChars: (now = clockNow()) => clock.spokenChars(now, text.length),
  };
  // El texto en pantalla no le quita la boca a la voz que está sonando.
  if (!(options.source === 'text' && active?.source === 'voice' && !active.clock.finished)) {
    active = track;
  }
  return track;
}

/** La pista activa (p. ej. la voz que lee la respuesta), o null. */
export function activeSpeech(): SpeechTrack | null {
  return active && !active.clock.finished ? active : null;
}

/** ¿Hay alguien hablando (aunque el audio aún no haya empezado)? */
export function isSpeechActive(): boolean {
  return active !== null && !active.clock.finished;
}

/**
 * Forma de la boca ahora, o null si nadie habla (entonces el avatar usa su animación propia).
 * Mientras la voz aún no suena, la boca está en reposo.
 */
export function liveMouth(now = clockNow()): MouthShape | null {
  if (!active || active.clock.finished) return null;
  return active.clock.started ? active.clock.mouth(now) : REST_MOUTH;
}

/** Solo tests. */
export function resetSpeech(): void {
  active = null;
}
