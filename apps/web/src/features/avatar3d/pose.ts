import type { SceneSpec } from './sceneSpec';

/*
 * Poses del avatar por estado de animación. Funciones puras de (estado, tiempo, movimiento):
 * el controlador 3D interpola suavemente hacia la pose objetivo en cada frame.
 */

export const AVATAR_STATES = ['idle', 'thinking', 'listening', 'speaking', 'happy'] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

export const AVATAR_STATE_LABELS: Record<AvatarState, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  listening: 'Listening',
  speaking: 'Speaking',
  happy: 'Happy',
};

export interface Pose {
  bodyY: number;
  bodyRotX: number;
  bodyRotY: number;
  bodyRotZ: number;
  /** Escala vertical del cuerpo (1 = normal); la horizontal compensa el volumen. */
  squash: number;
  headTilt: number;
  headNod: number;
  lookX: number;
  lookY: number;
  /** 0 = ojos cerrados, 1 = abiertos (algo más de 1 = muy abiertos). */
  eyeOpen: number;
  /** 0–1: ojos felices en arco. */
  eyeHappy: number;
  mouthOpen: number;
  mouthSmile: number;
  /** Elevación de brazos: 0 colgando, ~2.4 arriba. */
  armLeftRaise: number;
  armRightRaise: number;
  /** Brazo hacia delante (gesto o mano a la barbilla). */
  armLeftForward: number;
  armRightForward: number;
  legSwing: number;
  thinkingDots: number;
}

export const NEUTRAL_POSE: Pose = {
  bodyY: 0,
  bodyRotX: 0,
  bodyRotY: 0,
  bodyRotZ: 0,
  squash: 1,
  headTilt: 0,
  headNod: 0,
  lookX: 0,
  lookY: 0,
  eyeOpen: 1,
  eyeHappy: 0,
  mouthOpen: 0,
  mouthSmile: 0.6,
  armLeftRaise: 0.25,
  armRightRaise: 0.25,
  armLeftForward: 0,
  armRightForward: 0,
  legSwing: 0,
  thinkingDots: 0,
};

/** Parpadeo periódico: cierra ~0,15 s cada ~4,3 s. */
export function blink(t: number): number {
  const phase = t % 4.3;
  return phase > 4.15 ? Math.abs(Math.cos(((phase - 4.15) / 0.15) * Math.PI)) : 1;
}

/** Movimiento de reposo según idleBehavior del perfil (sutil). */
function idleMotion(motion: SceneSpec['motion'], t: number): Partial<Pose> {
  const speed = 0.7 + motion.energy * 0.9;
  const s = t * speed;
  switch (motion.idle) {
    case 'bounce':
      return {
        bodyY: Math.abs(Math.sin(s * 1.6)) * 0.06,
        squash: 1 - Math.max(0, Math.cos(s * 3.2)) * 0.02,
      };
    case 'float':
      return { bodyY: Math.sin(s) * 0.07 };
    case 'sway':
      return { bodyRotZ: Math.sin(s) * 0.05 };
    case 'breathe':
      return { squash: 1 + Math.sin(s * 1.2) * 0.022 };
    case 'hover_spin':
      return { bodyY: Math.sin(s) * 0.06, bodyRotY: Math.sin(s * 0.5) * 0.3 };
    case 'pulse':
      return { squash: 1 + Math.max(0, Math.sin(s * 2)) * 0.03 };
  }
}

/** Habla simulada: aperturas tipo sílaba con pausas entre frases (no es lip-sync). */
export function speechMouth(t: number): number {
  const syllables = Math.abs(Math.sin(t * 9.1)) * 0.65 + Math.abs(Math.sin(t * 4.3 + 1)) * 0.35;
  const phrase = Math.sin(t * 0.85) > -0.55 ? 1 : 0.12;
  return Math.min(1, syllables * phrase);
}

export function poseAt(state: AvatarState, t: number, motion: SceneSpec['motion']): Pose {
  const e = 0.6 + motion.expressiveness * 0.8;
  const base: Pose = {
    ...NEUTRAL_POSE,
    ...idleMotion(motion, t),
    lookX: Math.sin(t * 0.37) * 0.25,
    lookY: Math.sin(t * 0.23) * 0.1,
    eyeOpen: blink(t),
  };

  switch (state) {
    case 'idle':
      return base;
    case 'thinking':
      return {
        ...base,
        bodyRotZ: Math.sin(t * 0.8) * 0.03 + 0.04,
        headTilt: 0.16 * e,
        lookX: 0.55,
        lookY: 0.6,
        mouthSmile: 0.15,
        // Mano a la barbilla: brazo hacia delante y arriba, cerrado hacia el centro.
        armRightRaise: -0.55,
        armRightForward: 2.25,
        thinkingDots: 1,
      };
    case 'listening':
      return {
        ...base,
        bodyRotX: 0.12,
        headTilt: -0.13 * e,
        headNod: Math.max(0, Math.sin(t * 1.7)) * 0.08 * e,
        lookX: 0,
        lookY: 0.05,
        eyeOpen: Math.min(base.eyeOpen, 1) * 1.12,
        mouthSmile: 0.75,
      };
    case 'speaking':
      return {
        ...base,
        bodyY: base.bodyY + Math.abs(Math.sin(t * 2.4)) * 0.025 * e,
        bodyRotZ: Math.sin(t * 1.7) * 0.05 * e,
        headNod: Math.sin(t * 3.1) * 0.05 * e,
        lookX: Math.sin(t * 0.9) * 0.15,
        lookY: 0,
        mouthOpen: speechMouth(t),
        mouthSmile: 0.5,
        armRightRaise: 0.55 + (0.35 + Math.sin(t * 2.3) * 0.3) * e,
        armRightForward: 0.45,
        armLeftRaise: 0.35 + Math.max(0, Math.sin(t * 1.9 + 1.2)) * 0.35 * e,
        armLeftForward: 0.25,
      };
    case 'happy': {
      const hop = Math.abs(Math.sin(t * 3.4));
      return {
        ...base,
        bodyY: hop * 0.22 * e,
        squash: 1 + (hop < 0.15 ? -0.06 : 0.02),
        bodyRotY: Math.sin(t * 1.8) * 0.18,
        eyeHappy: 1,
        mouthOpen: 0.55,
        mouthSmile: 1,
        armLeftRaise: 2.2 + Math.sin(t * 7) * 0.25,
        armRightRaise: 2.2 + Math.sin(t * 7 + Math.PI) * 0.25,
        legSwing: Math.sin(t * 6.8) * 0.25,
      };
    }
  }
}
