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
