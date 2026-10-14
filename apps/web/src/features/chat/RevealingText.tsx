import { useEffect, useEffectEvent, useState } from 'react';
import { MessageText } from './MessageText';
import { revealedLength, speakingDurationMs } from './speech';

/**
 * Muestra la respuesta de Pixel progresivamente mientras "habla" y avisa al terminar.
 * Sin voz ni lip-sync: la duración depende del largo del texto.
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
    const duration = speakingDurationMs(text);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setShown(revealedLength(text, elapsed, duration));
      progress();
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return <MessageText text={text.slice(0, shown)} />;
}
