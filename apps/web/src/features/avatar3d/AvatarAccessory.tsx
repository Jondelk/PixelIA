import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { frontZ, type AccessorySpec, type SceneSpec } from './sceneSpec';

/** Lente: barril, anillo de acento y cristal. En el pecho (cámara) o en la mano (visor). */
function Lens({ item, radius }: { item: AccessorySpec; radius: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow position={[0, radius * 0.3, 0]}>
        <cylinderGeometry args={[radius, radius * 1.05, radius * 0.6, 40]} />
        <meshStandardMaterial color={item.color} roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, radius * 0.62, 0]}>
        <torusGeometry args={[radius * 0.86, radius * 0.07, 10, 40]} />
        <meshStandardMaterial color={item.detailColor} roughness={0.4} />
      </mesh>
      <mesh position={[0, radius * 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.78, 40]} />
        <meshPhysicalMaterial color="#0B0D12" roughness={0.08} clearcoat={1} />
      </mesh>
    </group>
  );
}

/** Pieza accesoria por tipo. La posición depende del punto de anclaje, del cuerpo y del rostro. */
export function AvatarAccessory({
  item,
  body,
  face,
}: {
  item: AccessorySpec;
  body: SceneSpec['body'];
  face?: SceneSpec['face'];
}) {
  const ref = useRef<Group>(null);
  const { halfWidth: w, halfHeight: h, halfDepth: d } = body;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;
    if (item.kind === 'leaf') ref.current.rotation.z = -0.5 + Math.sin(t * 1.6) * 0.08;
    if (item.kind === 'orbit_ring') ref.current.rotation.y = t * 0.6;
  });

  switch (item.kind) {
    case 'leaf':
      return (
        <group position={[w * 0.18, h * 0.97, 0]}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.018, 0.022, 0.14, 8]} />
            <meshStandardMaterial color={item.detailColor} roughness={0.8} />
          </mesh>
          <group ref={ref} position={[0, 0.12, 0]}>
            <mesh position={[0.17, 0.02, 0]} scale={[0.2, 0.035, 0.1]} castShadow>
              <sphereGeometry args={[1, 24, 12]} />
              <meshStandardMaterial color={item.color} roughness={0.55} />
            </mesh>
            <mesh position={[0.17, 0.045, 0]} scale={[0.17, 0.006, 0.006]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={item.detailColor} />
            </mesh>
          </group>
        </group>
      );
    case 'cup':
      return (
        <group rotation={[0, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.1, 0.08, 0.16, 24]} />
            <meshStandardMaterial color={item.color} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.088, 24]} />
            <meshStandardMaterial color={item.detailColor} roughness={0.3} />
          </mesh>
          <mesh position={[0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.04, 0.012, 8, 16]} />
            <meshStandardMaterial color={item.color} roughness={0.35} />
          </mesh>
        </group>
      );
    case 'orbit_ring':
      return (
        <group ref={ref} rotation={[0.35, 0, 0.15]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[w * 1.35, 0.018, 8, 96]} />
            <meshStandardMaterial
              color={item.color}
              emissive={item.color}
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[w * 1.35, 0, 0]}>
            <sphereGeometry args={[0.05, 16, 12]} />
            <meshStandardMaterial
              color={item.color}
              emissive={item.color}
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      );
    case 'helmet': {
      // Se apoya sobre la parte superior del cuerpo: en un bloque, sobre su cara plana.
      const top = body.kind === 'block' ? h : h * 0.8;
      return (
        <group position={[0, top, 0]}>
          <mesh castShadow scale={[w * 0.82, h * 0.32, d * 0.95]}>
            <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color={item.color} roughness={0.35} clearcoat={0.6} />
          </mesh>
          <mesh scale={[w * 0.98, 1, d * 1.1]}>
            <cylinderGeometry args={[1, 1, 0.03, 32]} />
            <meshStandardMaterial color={item.detailColor} roughness={0.5} />
          </mesh>
        </group>
      );
    }
    case 'lens': {
      if (item.attach === 'hand') return <Lens item={item} radius={0.1} />;
      const radius = Math.min(w, h) * 0.26;
      const y = -h * 0.5;
      return (
        <group position={[0, y, frontZ(body, 0, y)]}>
          <Lens item={item} radius={radius} />
        </group>
      );
    }
    case 'headphones': {
      // Diadema sobre la cabeza y dos auriculares a los lados, a la altura de los ojos.
      const y = h * 0.22;
      const side =
        w * Math.sqrt(Math.max(0.05, 1 - (y / h) ** 2)) * (body.kind === 'block' ? 1.03 : 1);
      const lift = (h - y + 0.06) / (side + 0.04);
      return (
        <group position={[0, y, 0]}>
          <mesh scale={[1, lift, 1]}>
            <torusGeometry args={[side + 0.04, 0.035, 10, 48, Math.PI]} />
            <meshStandardMaterial color={item.detailColor} roughness={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * (side + 0.04), 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.15, 0.15, 0.12, 32]} />
              <meshStandardMaterial color={item.color} roughness={0.45} />
            </mesh>
          ))}
        </group>
      );
    }
    case 'glasses': {
      if (!face) return null;
      const radius = 0.11 * face.scale;
      const z = frontZ(body, face.eyeSpacing, face.eyeY) + 0.035;
      return (
        <group position={[0, face.eyeY, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * face.eyeSpacing, 0, z]}>
              <torusGeometry args={[radius, 0.014, 8, 32]} />
              <meshStandardMaterial color={item.color} roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, radius * 0.25, z]}>
            <boxGeometry args={[Math.max(0.02, face.eyeSpacing * 2 - radius * 2), 0.018, 0.018]} />
            <meshStandardMaterial color={item.color} roughness={0.4} />
          </mesh>
        </group>
      );
    }
    case 'badge':
      return (
        <mesh position={[w * 0.42, -h * 0.42, d * 0.78]} rotation={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.025, 24]} />
          <meshStandardMaterial color={item.color} metalness={0.3} roughness={0.35} />
        </mesh>
      );
  }
}

/** Tres puntos que flotan sobre la cabeza mientras piensa. */
export function ThinkingDots({ spec, visible }: { spec: SceneSpec; visible: () => number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const amount = visible();
    ref.current.scale.setScalar(Math.max(0.001, amount));
    ref.current.children.forEach((child, index) => {
      child.position.y = index * 0.16 + Math.sin(clock.elapsedTime * 3 + index) * 0.03;
    });
  });
  const { halfWidth: w, halfHeight: h } = spec.body;
  return (
    <group ref={ref} position={[w * 0.75, h * 1.05, 0.2]}>
      {[0.045, 0.065, 0.09].map((r, index) => (
        <mesh key={r} position={[index * 0.13, index * 0.16, 0]}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshStandardMaterial
            color={spec.accentColor}
            emissive={spec.accentColor}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}
