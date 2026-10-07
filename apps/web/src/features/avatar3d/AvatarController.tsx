import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, type Group } from 'three';
import { AvatarAccessory, ThinkingDots } from './AvatarAccessory';
import { AvatarBody } from './AvatarBody';
import { AvatarFace } from './AvatarFace';
import { AvatarLimbs } from './AvatarLimbs';
import { NEUTRAL_POSE, poseAt, type AvatarState, type Pose } from './pose';
import type { SceneSpec } from './sceneSpec';

/** Velocidad de interpolación por campo (más alta = transición más rápida). */
const FAST_FIELDS = new Set<keyof Pose>(['mouthOpen', 'eyeOpen']);

/**
 * Orquesta el personaje: calcula la pose objetivo del estado actual, la interpola con
 * suavidad (las transiciones entre estados nunca saltan) y la aplica al cuerpo y al rostro.
 */
export function AvatarController({ spec, state }: { spec: SceneSpec; state: AvatarState }) {
  const pose = useRef<Pose>({ ...NEUTRAL_POSE });
  const root = useRef<Group>(null);
  const face = useRef<Group>(null);
  const time = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    time.current += dt;
    const target = poseAt(state, time.current, spec.motion);
    const current = pose.current;
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      current[key] = MathUtils.damp(current[key], target[key], FAST_FIELDS.has(key) ? 22 : 7, dt);
    }

    if (root.current) {
      root.current.position.y = current.bodyY;
      root.current.rotation.set(current.bodyRotX, current.bodyRotY, current.bodyRotZ);
      const sideways = 1 / Math.sqrt(current.squash);
      root.current.scale.set(sideways, current.squash, sideways);
    }
    if (face.current) face.current.rotation.set(-current.headNod, 0, current.headTilt);
  });

  const handItems = spec.accessories.filter((item) => item.attach === 'hand');
  const otherItems = spec.accessories.filter((item) => item.attach !== 'hand');

  return (
    <group ref={root}>
      <AvatarBody body={spec.body} />
      <group ref={face} position={[0, 0, 0]}>
        <AvatarFace spec={spec} pose={pose} />
      </group>
      <AvatarLimbs
        spec={spec}
        pose={pose}
        handItem={handItems[0] && <AvatarAccessory item={handItems[0]} body={spec.body} />}
      />
      {otherItems.map((item) => (
        <AvatarAccessory key={item.kind} item={item} body={spec.body} />
      ))}
      <ThinkingDots spec={spec} visible={() => pose.current.thinkingDots} />
    </group>
  );
}
