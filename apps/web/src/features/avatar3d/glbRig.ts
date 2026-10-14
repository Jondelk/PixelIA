import { NEUTRAL_POSE, type Pose } from './pose';

/*
 * Traducción pura de una Pose (la misma que usa el avatar paramétrico) a transformaciones de
 * los nodos del modelo esculpido. Los nombres de nodo los define Pixel Sculpt
 * (packages/sculpt/src/character.ts): PixelRoot, Face, Eye_L/R, Pupil_L/R, Mouth, Arm_L/R,
 * Leg_L/R. "L" es la izquierda del personaje (a la derecha de quien lo mira, +X).
 *
 * En glTF el personaje mira hacia +Z y Y es arriba. Los nodos no traen rotación propia, así que
 * cada transformación se suma a la de reposo.
 */

export const RIG_NODES = [
  'PixelRoot',
  'Face',
  'Eye_L',
  'Eye_R',
  'Pupil_L',
  'Pupil_R',
  'Mouth',
  'Arm_L',
  'Arm_R',
  'Leg_L',
  'Leg_R',
] as const;
export type RigNode = (typeof RIG_NODES)[number];

export interface NodeTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Transformaciones relativas al reposo de cada nodo.
 * `lookRange` es cuánto se desplaza la pupila (proporcional al tamaño del ojo).
 */
export function poseToRig(pose: Pose, lookRange: number): Partial<Record<RigNode, NodeTransform>> {
  const sideways = 1 / Math.sqrt(pose.squash);
  const blink = Math.max(0.06, pose.eyeOpen * (1 - 0.55 * pose.eyeHappy));
  // Brazos: en reposo cuelgan; la pose paramétrica los describe con una elevación neutra.
  const raiseL = pose.armLeftRaise - NEUTRAL_POSE.armLeftRaise;
  const raiseR = pose.armRightRaise - NEUTRAL_POSE.armRightRaise;
  return {
    PixelRoot: {
      position: [0, pose.bodyY, 0],
      rotation: [pose.bodyRotX, pose.bodyRotY, pose.bodyRotZ],
      scale: [sideways, pose.squash, sideways],
    },
    Face: { rotation: [-pose.headNod, 0, pose.headTilt] },
    Eye_L: { scale: [1, blink, 1] },
    Eye_R: { scale: [1, blink, 1] },
    Pupil_L: { position: [pose.lookX * lookRange, pose.lookY * lookRange, 0] },
    Pupil_R: { position: [pose.lookX * lookRange, pose.lookY * lookRange, 0] },
    Mouth: {
      scale: [
        1 + (pose.mouthSmile - NEUTRAL_POSE.mouthSmile) * 0.15 - pose.mouthOpen * 0.08,
        1 + pose.mouthOpen * 1.4,
        1,
      ],
    },
    // +Z gira el brazo izquierdo (+X) hacia fuera y arriba; −X lo lleva hacia delante.
    Arm_L: { rotation: [-pose.armLeftForward, 0, raiseL] },
    Arm_R: { rotation: [-pose.armRightForward, 0, -raiseR] },
    Leg_L: { rotation: [pose.legSwing, 0, 0] },
    Leg_R: { rotation: [-pose.legSwing, 0, 0] },
  };
}
