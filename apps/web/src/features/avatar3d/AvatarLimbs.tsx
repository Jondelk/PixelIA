import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { PoseRef } from './poseRef';
import type { SceneSpec } from './sceneSpec';

/** Brazos y piernas sencillos. La mano izquierda puede sostener un accesorio. */
export function AvatarLimbs({
  spec,
  pose,
  handItem,
}: {
  spec: SceneSpec;
  pose: PoseRef;
  handItem?: ReactNode;
}) {
  const { limbs, body } = spec;
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const { halfWidth: w, halfHeight: h } = body;
  const armRadius = 0.07;

  useFrame(() => {
    const p = pose.current;
    if (!p) return;
    // Orden ZYX: primero el brazo va hacia delante (x) y luego se abre o se cierra (z).
    // Brazo izquierdo en x negativa: abrir = rotar z en negativo.
    leftArm.current?.rotation.set(-p.armLeftForward, 0, -p.armLeftRaise, 'ZYX');
    rightArm.current?.rotation.set(-p.armRightForward, 0, p.armRightRaise, 'ZYX');
    if (leftLeg.current) leftLeg.current.rotation.x = p.legSwing;
    if (rightLeg.current) rightLeg.current.rotation.x = -p.legSwing;
  });

  const limbMaterial = <meshStandardMaterial color={limbs.color} roughness={0.7} />;

  const arm = (side: -1 | 1) => (
    <group
      key={`arm${side}`}
      ref={side === -1 ? leftArm : rightArm}
      position={[side * w * 0.93, -h * 0.12, 0]}
    >
      <mesh position={[0, -limbs.armLength / 2, 0]} castShadow>
        <capsuleGeometry args={[armRadius, limbs.armLength - armRadius * 2, 6, 12]} />
        {limbMaterial}
      </mesh>
      <mesh position={[0, -limbs.armLength, 0]} castShadow>
        <sphereGeometry args={[armRadius * 1.6, 20, 16]} />
        {limbMaterial}
      </mesh>
      {side === -1 && handItem && (
        <group position={[0, -limbs.armLength - 0.06, 0.08]}>{handItem}</group>
      )}
    </group>
  );

  const leg = (side: -1 | 1) => (
    <group
      key={`leg${side}`}
      ref={side === -1 ? leftLeg : rightLeg}
      position={[side * w * 0.36, -h * 0.9, 0]}
    >
      <mesh position={[0, -limbs.legLength / 2, 0]} castShadow>
        <capsuleGeometry args={[0.075, Math.max(0.01, limbs.legLength - 0.1), 6, 12]} />
        {limbMaterial}
      </mesh>
      <mesh position={[0, -limbs.legLength, 0.07]} scale={[0.13, 0.07, 0.19]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
        {limbMaterial}
      </mesh>
    </group>
  );

  return (
    <group>
      {limbs.arms && [arm(-1), arm(1)]}
      {limbs.legs && [leg(-1), leg(1)]}
    </group>
  );
}
