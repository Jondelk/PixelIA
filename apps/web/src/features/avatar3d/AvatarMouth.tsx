import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import type { PoseRef } from './poseRef';
import { frontZ, type SceneSpec } from './sceneSpec';

const BASE_OPEN: Record<SceneSpec['face']['mouth'], number> = {
  soft_smile: 0,
  smile: 0,
  grin: 0,
  line: 0,
  open_smile: 0.3,
  none: 0,
};

const ARC: Record<SceneSpec['face']['mouth'], number> = {
  soft_smile: Math.PI * 0.55,
  smile: Math.PI * 0.75,
  grin: Math.PI * 0.95,
  open_smile: Math.PI * 0.75,
  line: Math.PI * 0.3,
  none: 0,
};

/** Boca: arco de sonrisa en reposo; se abre al hablar o al estar feliz (sin lip-sync real). */
export function AvatarMouth({ spec, pose }: { spec: SceneSpec; pose: PoseRef }) {
  const { face, body } = spec;
  const arc = useRef<Group>(null);
  const open = useRef<Mesh>(null);
  const s = face.scale;
  const z = frontZ(body, 0, face.mouthY);
  const arcAngle = ARC[face.mouth];

  useFrame(() => {
    const p = pose.current;
    if (!p) return;
    const openness = Math.min(1, Math.max(BASE_OPEN[face.mouth], p.mouthOpen));
    const arcVisible = Math.max(0, 1 - Math.max(0, openness - 0.12) / 0.2);
    const curve = face.mouth === 'line' ? 0.15 : 0.35 + p.mouthSmile * 0.75;
    arc.current?.scale.set(Math.max(0.001, arcVisible), Math.max(0.001, arcVisible * curve), 1);
    open.current?.scale.set(
      0.14 * s * (0.85 + p.mouthSmile * 0.4),
      Math.max(0.002, 0.14 * s * openness),
      0.07,
    );
  });

  if (face.mouth === 'none') return null;

  return (
    <group position={[0, face.mouthY, z]}>
      <group ref={arc}>
        <mesh rotation={[0, 0, -Math.PI / 2 - arcAngle / 2]}>
          <torusGeometry args={[0.12 * s, 0.022 * s, 10, 32, arcAngle]} />
          <meshStandardMaterial color={face.featureColor} roughness={0.4} />
        </mesh>
      </group>
      <mesh ref={open} position={[0, -0.03 * s, 0.005]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#2A0E0A" roughness={0.6} />
      </mesh>
    </group>
  );
}
