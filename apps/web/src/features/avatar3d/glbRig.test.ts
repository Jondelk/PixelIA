import { describe, expect, it } from 'vitest';
import { poseToRig, RIG_NODES } from './glbRig';
import { NEUTRAL_POSE, poseAt } from './pose';

const motion = {
  idle: 'bounce' as const,
  energy: 0.5,
  expressiveness: 0.6,
  stance: 'balanced' as const,
};

describe('poseToRig', () => {
  it('la pose neutra deja cada nodo en su reposo', () => {
    const rig = poseToRig(NEUTRAL_POSE, 0.02);
    const near = (values: number[] | undefined, expected: number[]) =>
      expected.forEach((value, i) => expect(values![i]).toBeCloseTo(value, 9));
    near(rig.PixelRoot!.position, [0, 0, 0]);
    near(rig.PixelRoot!.rotation, [0, 0, 0]);
    near(rig.PixelRoot!.scale, [1, 1, 1]);
    near(rig.Eye_L!.scale, [1, 1, 1]);
    near(rig.Arm_L!.rotation, [0, 0, 0]);
    near(rig.Arm_R!.rotation, [0, 0, 0]);
    near(rig.Mouth!.scale, [1, 1, 1]);
  });

  it('cubre todos los nodos del rig que exporta Pixel Sculpt', () => {
    expect(Object.keys(poseToRig(NEUTRAL_POSE, 0.02)).sort()).toEqual([...RIG_NODES].sort());
  });

  it('parpadea sin colapsar la geometría', () => {
    const rig = poseToRig({ ...NEUTRAL_POSE, eyeOpen: 0 }, 0.02);
    expect(rig.Eye_L!.scale![1]).toBeCloseTo(0.06);
  });

  it('el aplastamiento conserva el volumen', () => {
    const [sx, sy, sz] = poseToRig({ ...NEUTRAL_POSE, squash: 0.9 }, 0.02).PixelRoot!.scale!;
    expect(sx * sy * sz).toBeCloseTo(1, 6);
  });

  it('feliz: ambos brazos arriba y hacia fuera (signos opuestos por lado)', () => {
    const rig = poseToRig(poseAt('happy', 1.3, motion), 0.02);
    expect(rig.Arm_L!.rotation![2]).toBeGreaterThan(1.5);
    expect(rig.Arm_R!.rotation![2]).toBeLessThan(-1.5);
  });

  it('hablando: la boca se abre y la mirada se mueve dentro del rango', () => {
    const rig = poseToRig(poseAt('speaking', 0.2, motion), 0.05);
    expect(rig.Mouth!.scale![1]).toBeGreaterThan(1);
    expect(Math.abs(rig.Pupil_L!.position![0])).toBeLessThanOrEqual(0.05);
  });
});
