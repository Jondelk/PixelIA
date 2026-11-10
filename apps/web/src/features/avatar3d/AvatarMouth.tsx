import { mouthIndices, mouthLayer, mouthStyle, type MouthLayer } from '@pixel/sculpt/mouth';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three';
import { mouthMorphWeights } from './glbRig';
import type { PoseRef } from './poseRef';
import { frontZ, type SceneSpec } from './sceneSpec';

/** Separación de cada capa sobre la superficie (la lengua y los dientes, sobre el interior). */
const LIFT: Record<MouthLayer, number> = { inner: 0.006, teeth: 0.009, tongue: 0.009 };
const COLORS: Record<MouthLayer, string | null> = {
  inner: null,
  teeth: '#FBFAF6',
  tongue: '#E7737F',
};

interface Layer {
  layer: MouthLayer;
  geometry: BufferGeometry;
  base: Float32Array;
  open: Float32Array;
  round: Float32Array;
}

/**
 * Boca del avatar paramétrico: la MISMA forma que el modelo esculpido (`@pixel/sculpt/mouth`),
 * una sola pieza por capa que se abre y redondea con la pose (visemas al hablar). Cerrada es el
 * trazo de la sonrisa; abierta, una «D» con lengua. Nunca hay dos bocas superpuestas.
 */
export function AvatarMouth({ spec, pose }: { spec: SceneSpec; pose: PoseRef }) {
  const { face, body } = spec;
  // Unidad de la boca (equivale al radio del ojo del modelo esculpido).
  const re = 0.17 * face.scale;
  const style = mouthStyle(face.mouth);

  const layers = useMemo<Layer[]>(() => {
    const out: Layer[] = [];
    if (!mouthStyle(face.mouth)) return out;
    const index = new BufferAttribute(mouthIndices(), 1);
    for (const layer of ['inner', 'teeth', 'tongue'] as MouthLayer[]) {
      const base = mouthLayer(face.mouth, layer, 0, 0);
      const open = mouthLayer(face.mouth, layer, 1, 0);
      const round = mouthLayer(face.mouth, layer, 0, 1);
      if (!base || !open || !round) continue;
      const geometry = new BufferGeometry();
      const positions = new Float32Array((base.length / 2) * 3);
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setIndex(index);
      out.push({ layer, geometry, base, open, round });
    }
    return out;
  }, [face.mouth]);

  useEffect(() => () => layers.forEach((l) => l.geometry.dispose()), [layers]);

  useFrame(() => {
    const p = pose.current;
    if (!p || !style) return;
    const { open, round } = mouthMorphWeights(p, style.restOpen);
    for (const l of layers) {
      const attr = l.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < l.base.length / 2; i++) {
        const bx = l.base[i * 2]!;
        const by = l.base[i * 2 + 1]!;
        const x = (bx + (l.open[i * 2]! - bx) * open + (l.round[i * 2]! - bx) * round) * re;
        const y = (by + (l.open[i * 2 + 1]! - by) * open + (l.round[i * 2 + 1]! - by) * round) * re;
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        // Sigue la curvatura del cuerpo.
        arr[i * 3 + 2] = frontZ(body, x, face.mouthY + y) + LIFT[l.layer];
      }
      attr.needsUpdate = true;
      l.geometry.computeBoundingSphere();
    }
  });

  if (!style) return null;

  return (
    <group position={[0, face.mouthY, 0]}>
      {layers.map((l) => (
        <mesh key={l.layer} geometry={l.geometry} renderOrder={l.layer === 'inner' ? 1 : 2}>
          <meshStandardMaterial
            color={COLORS[l.layer] ?? face.featureColor}
            roughness={0.55}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
