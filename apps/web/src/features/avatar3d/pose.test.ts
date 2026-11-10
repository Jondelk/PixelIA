import { describe, expect, it } from 'vitest';
import { AVATAR_STATES, blink, poseAt, speechMouth } from './pose';

const motion = { idle: 'bounce', energy: 0.4, expressiveness: 0.66, stance: 'balanced' } as const;

describe('poseAt', () => {
  it('idle: movimiento sutil y boca cerrada', () => {
    for (let t = 0; t < 6; t += 0.25) {
      const pose = poseAt('idle', t, motion);
      expect(Math.abs(pose.bodyY)).toBeLessThan(0.1);
      expect(pose.mouthOpen).toBe(0);
    }
  });

  it('speaking: la boca se abre y se cierra con el tiempo', () => {
    const openings = Array.from(
      { length: 60 },
      (_, i) => poseAt('speaking', i * 0.05, motion).mouthOpen,
    );
    expect(Math.max(...openings)).toBeGreaterThan(0.6);
    expect(Math.min(...openings)).toBeLessThan(0.2);
  });

  it('happy: ojos felices, sonrisa abierta y brazos arriba', () => {
    const pose = poseAt('happy', 1, motion);
    expect(pose.eyeHappy).toBe(1);
    expect(pose.mouthOpen).toBeGreaterThan(0.4);
    expect(pose.armLeftRaise).toBeGreaterThan(1.8);
  });

  it('thinking: mira hacia arriba, mano a la barbilla y muestra los puntos', () => {
    const pose = poseAt('thinking', 2, motion);
    expect(pose.lookY).toBeGreaterThan(0.4);
    expect(pose.armRightForward).toBeGreaterThan(1.5);
    expect(pose.armRightRaise).toBeLessThan(0);
    expect(pose.thinkingDots).toBe(1);
  });

  it('listening: se inclina hacia delante y abre bien los ojos', () => {
    const pose = poseAt('listening', 0.5, motion);
    expect(pose.bodyRotX).toBeGreaterThan(0);
    expect(pose.eyeOpen).toBeGreaterThan(1);
  });

  it('es determinístico para todos los estados', () => {
    for (const state of AVATAR_STATES)
      expect(poseAt(state, 3.3, motion)).toEqual(poseAt(state, 3.3, motion));
  });

  it('parpadea y la voz tiene pausas', () => {
    expect(blink(1)).toBe(1);
    expect(blink(4.225)).toBeLessThan(0.1);
    expect(speechMouth(Math.PI * 1.6)).toBeLessThan(0.15);
  });
});
