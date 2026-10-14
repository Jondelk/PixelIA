import { useEffect, useEffectEvent, useState } from 'react';
import { buildTimeline } from '../avatar3d/lipsync';
import { activeSpeech, startSpeech } from '../avatar3d/speechSignal';
import { MessageText } from './MessageText';
import {
  REVEAL_BUDGET_MS,
  REVEAL_FLUSH_MS,
  spokenHeadLength,
  textSpeechRate,
  toWordEnd,
} from './speech';

/**
 * Muestra la respuesta de Pixel mientras la dice, palabra por palabra, en sincronía con la boca
 * del avatar (avatar3d/lipsync.ts):
 * - Con voz (sesión de voz activa): el texto sigue a la voz real; al terminar de hablar aparece
 *   el resto.
 * - Sin voz: la boca "lee" la respuesta y el texto aparece al mismo ritmo. Las respuestas largas
 *   no hacen esperar: pasado el presupuesto, el resto aparece en menos de un segundo.
 */
export function RevealingText({
  text,
  onDone,
  onProgress,
}: {
  text: string;
  onDone: () => void;
  onProgress?: () => void;
}) {
  const [shown, setShown] = useState(0);
  const finish = useEffectEvent(onDone);
  const progress = useEffectEvent(() => onProgress?.());

  useEffect(() => {
    const voice = activeSpeech();
    const speaking = voice?.source === 'voice' ? voice : null;
    const own = speaking
      ? null
      : startSpeech(text, { source: 'text', rate: textSpeechRate(buildTimeline(text).duration) });
    own?.begin();
    const head = spokenHeadLength(text);
    const start = performance.now();
    let flush: { at: number; from: number } | null = null;
    let last = -1;
    let frame = 0;

    const tick = (now: number) => {
      let current = Math.max(0, last);
      if (!flush) {
        if (speaking) {
          const ratio = speaking.text.length ? speaking.spokenChars(now) / speaking.text.length : 1;
          current = toWordEnd(text, Math.round(ratio * head));
          if (speaking.clock.finished) flush = { at: now, from: current };
        } else if (own) {
          current = own.spokenChars(now);
          if (own.clock.finished || current >= text.length) flush = { at: now, from: current };
        }
        if (!flush && now - start > REVEAL_BUDGET_MS + (speaking ? 20_000 : 0)) {
          flush = { at: now, from: current };
        }
        if (flush) own?.end();
      }
      if (flush) {
        const k = Math.min(1, (now - flush.at) / REVEAL_FLUSH_MS);
        current = toWordEnd(text, Math.round(flush.from + (text.length - flush.from) * k));
      }
      if (current !== last) {
        last = current;
        setShown(current);
        progress();
      }
      if (last < text.length) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      own?.end();
    };
  }, [text]);

  return <MessageText text={text.slice(0, shown)} />;
}
