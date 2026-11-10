import type { PixelCommandSource } from '@pixel/contracts';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { reportPresence, usePixelPresence } from './presenceContext';
import {
  markVoiceNoticeSeen,
  VOICE_PRIVACY_NOTICE,
  voiceNoticeSeen,
  voiceProfileOf,
} from './presenceProfile';
import type { VoiceInputError, VoiceInputProvider } from './voice';

/*
 * PixelComposer (Prompt 17): la ÚNICA entrada para hablarle a Pixel (Inicio, Campañas, Plan de
 * contenido, Pixel Dock, preguntas y ajustes). Texto, micrófono y envío con el mismo `onSubmit`:
 * una transcripción final llega como `(texto, 'voice')` y sigue exactamente el flujo de
 * PixelCommand (mismas validaciones, misma confirmación). El texto siempre funciona.
 */

export interface ComposerSuggestion {
  label: string;
  /** Lo que se escribe en el campo al pulsarla (un inicio de frase, nunca un formulario). */
  text: string;
  /** Prompt 20: en lugar de escribir, abre una pantalla de Pixel («Ver mi agenda»). */
  to?: string;
}

const VOICE_NOTES: Record<VoiceInputError, string> = {
  unsupported: 'El micrófono no está disponible. Puedes seguir escribiendo.',
  denied: 'El micrófono no está disponible. Puedes seguir escribiendo.',
  no_speech: 'No te escuché. Inténtalo de nuevo o escríbelo.',
  failed: 'No pude usar el micrófono. Puedes seguir escribiendo.',
};

export function PixelComposer({
  placeholder,
  onSubmit,
  busy = false,
  compact = false,
  suggestions = [],
  voiceInput,
  initialText = '',
}: {
  placeholder: string;
  onSubmit: (text: string, source: PixelCommandSource) => void;
  busy?: boolean;
  compact?: boolean;
  suggestions?: ComposerSuggestion[];
  /** Para tests: un proveedor de voz simulado (por defecto, el de la presencia). */
  voiceInput?: VoiceInputProvider;
  /** Prompt 20: borrador inicial (p. ej. «Quiero reorganizar el miércoles 21: »). Nunca se envía solo. */
  initialText?: string;
}) {
  const id = useId();
  const presence = usePixelPresence();
  const voice = voiceInput ?? presence.input;
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [askNotice, setAskNotice] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const micAvailable = voice.supported && presence.preferences.voiceEnabled;

  // Nunca escucha en segundo plano: al desmontar (navegar, cambiar de Pixel) se cierra.
  useEffect(() => () => voice.stop(), [voice]);

  // Prompt 20: con un borrador, el cursor va al final (se sigue escribiendo, no se escribe delante).
  useEffect(() => {
    if (!initialText || !field.current) return;
    field.current.setSelectionRange(initialText.length, initialText.length);
  }, [initialText]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    onSubmit(value, 'text');
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const startListening = () => {
    if (listening || busy) return;
    setNote(null);
    let finalText = '';
    setListening(true);
    presence.startVoiceSession();
    presence.listen();
    reportPresence('voice_input_started');
    voice.start(
      {
        onTranscript: (transcript, final) => {
          setText(transcript);
          if (final) finalText = transcript;
        },
        onEnd: () => {
          setListening(false);
          const value = finalText.trim();
          if (value) {
            onSubmit(value, 'voice');
            setText('');
          } else {
            presence.idle();
          }
        },
        onError: (error) => {
          setListening(false);
          presence.idle();
          setNote(VOICE_NOTES[error]);
          reportPresence('voice_input_failed', { error });
        },
      },
      voiceProfileOf(presence.scope?.avatar ?? null).language,
    );
  };

  // La primera vez en este dispositivo, el aviso de privacidad antes de abrir el micrófono; después,
  // el micrófono se comporta igual que siempre.
  const onMic = () => {
    if (listening || busy) return;
    if (!voiceNoticeSeen()) {
      setAskNotice(true);
      return;
    }
    startListening();
  };

  const acceptNotice = () => {
    markVoiceNoticeSeen();
    setAskNotice(false);
    startListening();
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-2xl border border-line-strong bg-elevated p-2 focus-within:border-focus"
      >
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={id}
          ref={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={listening ? 'Escuchando…' : placeholder}
          rows={compact ? 1 : 2}
          maxLength={2000}
          readOnly={listening}
          className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-fg placeholder:text-subtle focus:outline-none"
        />
        {micAvailable &&
          (listening ? (
            <Button
              variant="secondary"
              onClick={() => voice.stop()}
              aria-label="Detener el micrófono"
            >
              <span
                className="inline-block size-2 bg-alert motion-safe:animate-pulse"
                aria-hidden="true"
              />
              <span className="max-sm:sr-only">Detener</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={onMic}
              disabled={busy}
              aria-label="Hablar con Pixel"
              title="Hablar con Pixel"
            >
              <Icon name="mic" className="size-4" />
            </Button>
          ))}
        <Button
          type="submit"
          loading={busy}
          disabled={!text.trim() || listening}
          aria-label="Enviar a Pixel"
        >
          <Icon name="arrowRight" className="size-4" />
        </Button>
      </form>
      {askNotice && !listening && (
        <VoicePrivacyNotice onAccept={acceptNotice} onDismiss={() => setAskNotice(false)} />
      )}
      {listening && (
        <p className="text-xs text-muted" role="status" aria-live="polite">
          Escuchando… Habla con normalidad; termina con una pausa o pulsa «Detener».
        </p>
      )}
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
      {suggestions.length > 0 && !text && !listening && (
        <ul className="flex flex-wrap gap-2" aria-label="Para empezar">
          {suggestions.slice(0, 4).map((suggestion) => (
            <li key={suggestion.label}>
              {suggestion.to ? (
                <Link
                  to={suggestion.to}
                  className="inline-block rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {suggestion.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setText(suggestion.text);
                    field.current?.focus();
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {suggestion.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Aviso discreto antes del primer uso del micrófono (vista pura, testeable). */
export function VoicePrivacyNotice({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Privacidad de la voz"
      className="rounded-xl border border-line bg-surface px-4 py-3"
    >
      <p className="max-w-xl text-xs leading-relaxed text-muted">{VOICE_PRIVACY_NOTICE}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onAccept}>
          Entendido
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}
