import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { PoseRef } from './poseRef';
import { frontZ, type SceneSpec } from './sceneSpec';

function Eye({ side, spec, pose }: { side: -1 | 1; spec: SceneSpec; pose: PoseRef }) {
  const { face, body } = spec;
  const pupil = useRef<Group>(null);
  const radius = 0.13 * face.scale;
  const x = side * face.eyeSpacing;
  const z = frontZ(body, x, face.eyeY);

  useFrame(() => {
    const p = pose.current;
    if (!p || !pupil.current) return;
    pupil.current.position.x = p.lookX * radius * 0.35;
    pupil.current.position.y = p.lookY * radius * 0.35;
  });

  switch (face.eyes) {
    case 'round':
    case 'oval':
    case 'crescent': {
      const [sx, sy] = face.eyes === 'oval' ? [0.8, 1.25] : [1, 1.08];
      return (
        <group position={[x, face.eyeY, z]}>
          <mesh scale={[radius * sx, radius * sy, radius * 0.55]}>
            <sphereGeometry args={[1, 32, 24]} />
            <meshStandardMaterial color="#FBFAF7" roughness={0.35} />
          </mesh>
          <group ref={pupil}>
            <mesh
              position={[0, 0, radius * 0.42]}
              scale={[radius * 0.58 * sx, radius * 0.62 * sy, radius * 0.3]}
            >
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color={face.featureColor} roughness={0.2} />
            </mesh>
            <mesh position={[radius * 0.22, radius * 0.25, radius * 0.62]} scale={radius * 0.18}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
          </group>
        </group>
      );
    }
    case 'dot':
      return (
        <mesh position={[x, face.eyeY, z]} scale={[radius * 0.45, radius * 0.5, radius * 0.25]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={face.featureColor} roughness={0.3} />
        </mesh>
      );
    case 'line':
      return (
        <mesh position={[x, face.eyeY, z]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[radius * 0.14, radius * 0.9, 4, 8]} />
          <meshStandardMaterial color={face.featureColor} />
        </mesh>
      );
    case 'visor':
      return (
        <group ref={pupil} position={[x, face.eyeY, z + 0.06]}>
          <RoundedBox args={[radius * 1.2, radius * 0.42, 0.04]} radius={0.02}>
            <meshStandardMaterial
              color={face.accentColor}
              emissive={face.accentColor}
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </RoundedBox>
        </group>
      );
  }
}

/** Arco de "ojos felices". */
function HappyArch({ side, spec }: { side: -1 | 1; spec: SceneSpec }) {
  const { face, body } = spec;
  const radius = 0.13 * face.scale;
  const x = side * face.eyeSpacing;
  return (
    <mesh position={[x, face.eyeY - radius * 0.2, frontZ(body, x, face.eyeY) + 0.02]}>
      <torusGeometry args={[radius * 0.72, radius * 0.17, 10, 24, Math.PI]} />
      <meshStandardMaterial color={face.featureColor} roughness={0.4} />
    </mesh>
  );
}

/** Ojos según `eyesStyle`; parpadean, miran y se vuelven arcos felices según la pose. */
export function AvatarEyes({ spec, pose }: { spec: SceneSpec; pose: PoseRef }) {
  const { face, body } = spec;
  const open = useRef<Group>(null);
  const happy = useRef<Group>(null);
  const radius = 0.13 * face.scale;

  useFrame(() => {
    const p = pose.current;
    if (!p) return;
    const happyAmount = face.eyes === 'crescent' ? 1 : p.eyeHappy;
    open.current?.scale.set(1, Math.max(0.05, p.eyeOpen * (1 - happyAmount)), 1);
    happy.current?.scale.setScalar(Math.max(0.001, happyAmount));
  });

  const z = frontZ(body, 0, face.eyeY);
  return (
    <group>
      {face.eyes === 'visor' && (
        <RoundedBox
          args={[face.eyeSpacing * 2 + radius * 2.4, radius * 1.15, 0.08]}
          radius={0.05}
          position={[0, face.eyeY, z + 0.02]}
        >
          <meshPhysicalMaterial color="#0A0F1C" roughness={0.15} clearcoat={1} />
        </RoundedBox>
      )}
      <group ref={open} position={[0, face.eyeY, 0]}>
        <group position={[0, -face.eyeY, 0]}>
          <Eye side={-1} spec={spec} pose={pose} />
          <Eye side={1} spec={spec} pose={pose} />
        </group>
      </group>
      {face.eyes !== 'visor' && (
        <group ref={happy}>
          <HappyArch side={-1} spec={spec} />
          <HappyArch side={1} spec={spec} />
        </group>
      )}
    </group>
  );
}
