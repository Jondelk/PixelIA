import { RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import { CatmullRomCurve3, LatheGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import { AvatarMaterial } from './AvatarMaterial';
import type { SceneSpec } from './sceneSpec';

type BodySpec = SceneSpec['body'];

/** Ranura central del grano de café, apoyada sobre la superficie del elipsoide. */
function grooveGeometry(body: BodySpec, from: number, to: number, side: 1 | -1) {
  const { halfWidth: w, halfHeight: h, halfDepth: d } = body;
  const points: Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const v = from + ((to - from) * i) / 24;
    const y = v * h;
    const x = Math.sin(v * Math.PI * 1.1) * w * 0.12;
    const inside = Math.max(0, 1 - (x / w) ** 2 - (y / h) ** 2);
    points.push(new Vector3(x, y, side * d * Math.sqrt(inside) * 1.005));
  }
  return new TubeGeometry(new CatmullRomCurve3(points), 48, 0.035, 8, false);
}

function dropGeometry() {
  const points: Vector2[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    const r = Math.sin(a) * Math.pow(1 - a / Math.PI, 0.35) * 1.15;
    points.push(new Vector2(Math.max(r, 0.0001), -Math.cos(a)));
  }
  return new LatheGeometry(points, 64);
}

export function AvatarBody({ body }: { body: BodySpec }) {
  const { halfWidth: w, halfHeight: h, halfDepth: d, kind } = body;

  const grooves = useMemo(
    () =>
      body.groove
        ? [
            grooveGeometry(body, 0.42, 0.97, 1),
            grooveGeometry(body, -0.97, -0.3, 1),
            grooveGeometry(body, -0.97, 0.97, -1),
          ]
        : [],
    [body],
  );
  const drop = useMemo(() => (kind === 'drop' ? dropGeometry() : null), [kind]);

  const material = <AvatarMaterial spec={body.material} />;

  return (
    <group>
      {(kind === 'seed' || kind === 'blob') && (
        <mesh castShadow receiveShadow scale={[w, h, d]}>
          <sphereGeometry args={[1, 64, 48]} />
          {material}
        </mesh>
      )}
      {kind === 'drop' && drop && (
        <mesh castShadow receiveShadow scale={[w, h, d]} geometry={drop}>
          {material}
        </mesh>
      )}
      {kind === 'capsule' && (
        <mesh castShadow receiveShadow scale={[1, 1, d / w]}>
          <capsuleGeometry args={[w, Math.max(0.01, 2 * (h - w)), 16, 32]} />
          {material}
        </mesh>
      )}
      {kind === 'crystal' && (
        <mesh castShadow receiveShadow scale={[w, h, d]}>
          <icosahedronGeometry args={[1, 0]} />
          {material}
        </mesh>
      )}
      {kind === 'block' && (
        <RoundedBox
          args={[2 * w, 2 * h, 2 * d]}
          radius={Math.min(w, h, d) * (0.15 + body.roundness * 0.6)}
          smoothness={6}
          castShadow
          receiveShadow
        >
          {material}
        </RoundedBox>
      )}

      {grooves.map((geometry, index) => (
        <mesh key={index} geometry={geometry} castShadow>
          <meshStandardMaterial color={body.detailColor} roughness={0.9} />
        </mesh>
      ))}

      {body.panelLines &&
        [-0.45, -0.62].map((y) => (
          <mesh key={y} position={[0, y * h, 0]}>
            <boxGeometry args={[2 * w + 0.02, 0.025, 2 * d + 0.02]} />
            <meshStandardMaterial color={body.detailColor} roughness={0.9} />
          </mesh>
        ))}
    </group>
  );
}
