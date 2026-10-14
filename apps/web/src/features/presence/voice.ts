/*
 * Voice Runtime (Prompt 17, docs/PIXEL-PRESENCE.md §4). La voz es OTRA ENTRADA de PixelCommand,
 * no otro asistente: una transcripción final entra por el mismo `onSubmit(text, 'voice')` que el teclado.
 *
 * - VoiceInputProvider / VoiceOutputProvider desacoplan la UI del navegador: hoy hay implementación
 *   del navegador (Web Speech) y un proveedor nulo; mañana un STT/TTS externo sin tocar PixelCommand.
 * - El texto SIEMPRE funciona: sin soporte, sin permiso o con fallo, se degrada a solo texto.
 * - Nunca se graba en segundo plano ni se guarda audio: el micrófono solo se abre por una acción
 *   explícita y se cierra al terminar, al navegar o al cambiar de Pixel.
 */

export type VoiceInputError = 'unsupported' | 'denied' | 'no_speech' | 'failed';

export interface VoiceInputHandlers {
  /** Texto reconocido; `final` = el usuario terminó de hablar. */
  onTranscript: (text: string, final: boolean) => void;
  onEnd: () => void;
  onError: (error: VoiceInputError) => void;
}

export interface VoiceInputProvider {
  readonly supported: boolean;
  start(handlers: VoiceInputHandlers, lang: string): void;
  stop(): void;
}

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
}

export interface SpeakOptions {
  lang: string;
  rate: number;
  voiceId: string | null;
}

/**
 * Eventos de la voz. `onBoundary` (inicio de cada palabra, con su posición en el texto) es lo que
 * ancla la sincronía labial a la voz real (avatar3d/lipsync.ts); no todas las voces lo emiten, y
 * sin él la boca sigue el cronograma estimado. `onAudioLevel`/`onViseme` quedan para un TTS externo.
 */
export interface VoiceOutputHandlers {
  onStart?: () => void;
  onEnd: () => void;
  onError: (error: 'unsupported' | 'failed') => void;
  onBoundary?: (charIndex: number) => void;
  onAudioLevel?: (level: number) => void;
  onViseme?: (viseme: string) => void;
}

export interface VoiceOutputProvider {
  readonly supported: boolean;
  voices(): VoiceOption[];
  speak(text: string, options: SpeakOptions, handlers: VoiceOutputHandlers): void;
  cancel(): void;
  /** Las voces del navegador llegan de forma asíncrona: avisa cuando cambian. */
  onVoicesChanged(listener: () => void): () => void;
}

export const NO_VOICE_INPUT: VoiceInputProvider = {
  supported: false,
  start: (handlers) => handlers.onError('unsupported'),
  stop: () => undefined,
};

export const NO_VOICE_OUTPUT: VoiceOutputProvider = {
  supported: false,
  voices: () => [],
  speak: (_text, _options, handlers) => handlers.onError('unsupported'),
  cancel: () => undefined,
  onVoicesChanged: () => () => undefined,
};

/* ---------- Navegador (Web Speech API) ---------- */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

interface VoiceWindow {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

const browser = (): VoiceWindow | null =>
  typeof window === 'undefined' ? null : (window as unknown as VoiceWindow);

/** Qué puede hacer ESTE navegador (capacidad de runtime, no del workspace). */
export function voiceCapabilities(win: VoiceWindow | null = browser()): {
  input: boolean;
  output: boolean;
} {
  return {
    input: Boolean(win?.SpeechRecognition ?? win?.webkitSpeechRecognition),
    output: Boolean(win?.speechSynthesis && win.SpeechSynthesisUtterance),
  };
}

const INPUT_ERRORS: Record<string, VoiceInputError> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  'no-speech': 'no_speech',
  'audio-capture': 'denied',
};

export function browserVoiceInput(win: VoiceWindow | null = browser()): VoiceInputProvider {
  const Ctor = win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
  if (!Ctor) return NO_VOICE_INPUT;
  let current: Recognition | null = null;
  return {
    supported: true,
    start(handlers, lang) {
      current?.abort();
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      let finalText = '';
      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]!;
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        handlers.onTranscript((finalText || interim).trim(), Boolean(finalText));
      };
      recognition.onerror = (event) => handlers.onError(INPUT_ERRORS[event.error] ?? 'failed');
      recognition.onend = () => {
        current = null;
        handlers.onEnd();
      };
      current = recognition;
      try {
        recognition.start();
      } catch {
        current = null;
        handlers.onError('failed');
      }
    },
    stop() {
      current?.stop();
      current = null;
    },
  };
}

/** «es_CO» (algunos Android) y «ES-co» cuentan como «es-CO». */
const normalizeLang = (lang: string) => lang.replace('_', '-').toLowerCase();

/**
 * La voz de Pixel cuando el usuario no eligió una: primero una cuyo idioma sea EXACTAMENTE `lang`
 * (es-CO); si no hay, cualquier voz en español (es-*); si tampoco, ninguna (la del navegador).
 */
export function preferredVoice<V extends { lang: string }>(voices: V[], lang: string): V | null {
  const wanted = normalizeLang(lang);
  const family = wanted.split('-')[0]!;
  return (
    voices.find((voice) => normalizeLang(voice.lang) === wanted) ??
    voices.find((voice) => {
      const voiceLang = normalizeLang(voice.lang);
      return voiceLang === family || voiceLang.startsWith(`${family}-`);
    }) ??
    null
  );
}

export function browserVoiceOutput(win: VoiceWindow | null = browser()): VoiceOutputProvider {
  const synth = win?.speechSynthesis;
  const Utterance = win?.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return NO_VOICE_OUTPUT;
  return {
    supported: true,
    voices: () =>
      synth.getVoices().map((voice) => ({
        id: voice.voiceURI,
        label: `${voice.name} (${voice.lang})`,
        lang: voice.lang,
      })),
    speak(text, options, handlers) {
      synth.cancel();
      const utterance = new Utterance(text);
      utterance.lang = options.lang;
      utterance.rate = options.rate;
      // La voz elegida en «Voz y movimiento» manda; si no, la preferida para el idioma (es-CO).
      const voices = synth.getVoices();
      const voice =
        (options.voiceId
          ? voices.find((candidate) => candidate.voiceURI === options.voiceId)
          : undefined) ?? preferredVoice(voices, options.lang);
      if (voice) utterance.voice = voice;
      utterance.onstart = () => handlers.onStart?.();
      utterance.onboundary = (event) => {
        // Solo límites de palabra (algunas voces también avisan de frases).
        if (!event.name || event.name === 'word') handlers.onBoundary?.(event.charIndex);
      };
      utterance.onend = () => handlers.onEnd();
      utterance.onerror = (event) => {
        // Cancelar (cambiar de Pixel, «Detener») no es un fallo.
        if (event.error === 'canceled' || event.error === 'interrupted') handlers.onEnd();
        else handlers.onError('failed');
      };
      try {
        synth.speak(utterance);
      } catch {
        handlers.onError('failed');
      }
    },
    cancel: () => synth.cancel(),
    onVoicesChanged(listener) {
      synth.addEventListener('voiceschanged', listener);
      return () => synth.removeEventListener('voiceschanged', listener);
    },
  };
}

/* ---------- Qué se dice ---------- */

const MAX_SPOKEN = 260;

/**
 * La versión hablada de una respuesta: corta y conversacional. Nunca ids, JSON, listas largas ni
 * informes completos: la UI muestra el detalle; la voz, la idea (la misma conversación, no otra).
 */
export function spokenText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[•\-*]/.test(line));
  const clean = (lines[0] ?? '')
    .replace(/\b[a-f\d]{24}\b/gi, '')
    .replace(/[{}[\]`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  if (clean.length <= MAX_SPOKEN) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]/g) ?? [clean];
  let spoken = '';
  for (const sentence of sentences) {
    if ((spoken + sentence).length > MAX_SPOKEN) break;
    spoken += sentence;
  }
  return (spoken || clean.slice(0, MAX_SPOKEN)).trim();
}
