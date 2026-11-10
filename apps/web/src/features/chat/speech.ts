/** Duración de la animación "speaking" según el largo de la respuesta (sin voz real). */
export function speakingDurationMs(text: string): number {
  return Math.round(Math.min(9_000, Math.max(1_800, text.length * 14)));
}

/** Cuántos caracteres mostrar tras `elapsed` ms, cortando en límites de palabra. */
export function revealedLength(text: string, elapsed: number, duration: number): number {
  if (elapsed >= duration) return text.length;
  const target = Math.floor((elapsed / duration) * text.length);
  const nextSpace = text.indexOf(' ', target);
  return nextSpace === -1 ? text.length : nextSpace;
}

/** Tiempo máximo en que la respuesta aparece al ritmo del habla; el resto aparece enseguida. */
export const REVEAL_BUDGET_MS = 9_000;
/** Lo que tarda en aparecer el resto cuando se agota el presupuesto o la voz termina. */
export const REVEAL_FLUSH_MS = 900;

/**
 * Velocidad del habla sin voz (el texto aparece al ritmo de la boca): natural en respuestas
 * cortas y algo más ágil en las largas, sin que la boca se acelere de forma artificial.
 */
export function textSpeechRate(estimatedMs: number): number {
  return Math.min(1.8, Math.max(1.15, estimatedMs / REVEAL_BUDGET_MS));
}

/** Avanza `from` hasta el siguiente límite de palabra (nunca corta una palabra). */
export function toWordEnd(text: string, from: number): number {
  if (from <= 0) return 0;
  if (from >= text.length) return text.length;
  const nextSpace = text.indexOf(' ', from);
  return nextSpace === -1 ? text.length : nextSpace;
}

/** Largo de la parte que lee la voz (su primera línea): el resto se muestra al terminar. */
export function spokenHeadLength(text: string): number {
  const newline = text.indexOf('\n');
  return newline === -1 ? text.length : newline;
}
