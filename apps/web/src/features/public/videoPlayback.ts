/** Lo que eligió el usuario con el botón de pausa (null = aún nada). */
export type VideoChoice = 'play' | 'pause' | null;

/**
 * ¿Debe reproducirse el video ahora? Nunca mientras otra capa lo tapa (el modal de acceso). Con
 * movimiento reducido solo si el usuario lo pidió expresamente; si no, solo si no lo pausó.
 */
export function shouldPlayVideo({
  reducedMotion,
  choice,
  suspended,
}: {
  reducedMotion: boolean;
  choice: VideoChoice;
  suspended: boolean;
}): boolean {
  if (suspended) return false;
  if (choice !== null) return choice === 'play';
  return !reducedMotion;
}
