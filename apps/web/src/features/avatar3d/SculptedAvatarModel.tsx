import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Euler, Vector3, type Mesh, type Object3D } from 'three';
import { poseToRig, RIG_NODES, type RigNode } from './glbRig';
import { dampPose, targetPose } from './livePose';
import { NEUTRAL_POSE, type AvatarState, type Pose } from './pose';
import type { SceneSpec } from './sceneSpec';

/** Caja que ocupa el modelo, para encuadrar la cámara (unidades de escena). */
export interface ModelBounds {
  top: number;
  bottom: number;
  halfWidth: number;
}

interface RestTransform {
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
}

/**
 * Personaje de la marca esculpido por Pixel Sculpt (.glb). Se anima con las mismas poses que el
 * avatar paramétrico (poseAt), aplicadas a los nodos con nombre del rig.
 */
export function SculptedAvatarModel({
  url,
  motion,
  state,
  reducedMotion = false,
  onBounds,
}: {
  url: string;
  motion: SceneSpec['motion'];
  state: AvatarState;
  /** prefers-reduced-motion: sin bucles (tiempo congelado), como el avatar paramétrico. */
  reducedMotion?: boolean;
  onBounds: (bounds: ModelBounds) => void;
}) {
  const gltf = useGLTF(url);
  // Copia propia: el mismo .glb puede estar montado en varias vistas a la vez.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const rig = useMemo(() => {
    const nodes = new Map<RigNode, Object3D>();
    const rest = new Map<Object3D, RestTransform>();
    for (const name of RIG_NODES) {
      const node = scene.getObjectByName(name);
      if (!node) continue;
      nodes.set(name, node);
      rest.set(node, {
        position: node.position.clone(),
        rotation: node.rotation.clone(),
        // El interior de la boca se escala en absoluto (en el archivo está cerrado).
        scale: name === 'Mouth_Open' ? new Vector3(1, 1, 1) : node.scale.clone(),
      });
    }
    const eye = nodes.get('Eye_L');
    const eyeSize = eye ? new Box3().setFromObject(eye).getSize(new Vector3()).x : 0.1;
    return { nodes, rest, lookRange: eyeSize * 0.12, mouthInterior: nodes.has('Mouth_Open') };
  }, [scene]);

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new Box3().setFromObject(scene);
    onBounds({
      top: box.max.y,
      bottom: box.min.y,
      halfWidth: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
    });
  }, [scene, onBounds]);

  const pose = useRef<Pose>({ ...NEUTRAL_POSE });
  const time = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (!reducedMotion) time.current += dt;
    const target = targetPose(state, time.current, motion, reducedMotion);
    const current = pose.current;
    dampPose(current, target.pose, dt, target.synced);

    const transforms = poseToRig(current, rig.lookRange, { mouthInterior: rig.mouthInterior });
    for (const [name, node] of rig.nodes) {
      const base = rig.rest.get(node)!;
      const t = transforms[name];
      if (!t) continue;
      const [px, py, pz] = t.position ?? [0, 0, 0];
      const [rx, ry, rz] = t.rotation ?? [0, 0, 0];
      const [sx, sy, sz] = t.scale ?? [1, 1, 1];
      node.position.set(base.position.x + px, base.position.y + py, base.position.z + pz);
      node.rotation.set(base.rotation.x + rx, base.rotation.y + ry, base.rotation.z + rz);
      node.scale.set(base.scale.x * sx, base.scale.y * sy, base.scale.z * sz);
    }
  });

  return <primitive object={scene} />;
}
