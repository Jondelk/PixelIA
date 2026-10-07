import { frontZ, type SceneSpec } from './sceneSpec';
import { AvatarEyes } from './AvatarEyes';
import { AvatarMouth } from './AvatarMouth';
import type { PoseRef } from './poseRef';

/** Rostro: ojos, boca y rubor, apoyados sobre la superficie frontal del cuerpo. */
export function AvatarFace({ spec, pose }: { spec: SceneSpec; pose: PoseRef }) {
  const { face, body } = spec;
  const cheekY = (face.eyeY + face.mouthY) / 2 - 0.02;
  const cheekX = face.eyeSpacing * 1.45;

  return (
    <group>
      <AvatarEyes spec={spec} pose={pose} />
      <AvatarMouth spec={spec} pose={pose} />
      {face.blush &&
        [-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * cheekX, cheekY, frontZ(body, side * cheekX, cheekY) + 0.004]}
            scale={[0.085 * face.scale, 0.045 * face.scale, 0.02]}
          >
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial
              color={face.blushColor}
              transparent
              opacity={0.55}
              roughness={0.9}
            />
          </mesh>
        ))}
    </group>
  );
}
