import { MathUtils } from 'three';
import { poseAt, SPEECH_FIELDS, withSpeech, type AvatarState, type Pose } from './pose';
import type { SceneSpec } from './sceneSpec';
import { liveMouth } from './speechSignal';

/** Campos rápidos fuera del habla sincronizada (parpadeo y boca simulada). */
const FAST_FIELDS = new Set<keyof Pose>(['mouthOpen', 'eyeOpen']);

/**
 * Pose objetivo del frame: la del estado y, si Pixel está hablando con texto conocido (voz o
 * respuesta que aparece), la boca del visema actual en lugar de la simulada.
 */
export function targetPose(
  state: AvatarState,
  t: number,
  motion: SceneSpec['motion'],
  reducedMotion: boolean,
): { pose: Pose; synced: boolean } {
  const pose = poseAt(state, t, motion);
  if (state !== 'speaking') return { pose, synced: false };
  const mouth = reducedMotion ? null : liveMouth();
  return mouth ? { pose: withSpeech(pose, mouth, motion), synced: true } : { pose, synced: false };
}

/** Interpola `current` hacia `target` (las transiciones nunca saltan). */
export function dampPose(current: Pose, target: Pose, dt: number, synced: boolean): void {
  for (const key of Object.keys(target) as (keyof Pose)[]) {
    // Con habla sincronizada la boca casi no se suaviza: un visema dura ~60–120 ms.
    const lambda = synced && SPEECH_FIELDS.has(key) ? 38 : FAST_FIELDS.has(key) ? 22 : 7;
    current[key] = MathUtils.damp(current[key], target[key], lambda, dt);
  }
}
