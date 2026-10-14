import type { MaterialSpec } from './sceneSpec';

/** Material estilizado (PBR suave, no hiperrealista) a partir de la especificación. */
export function AvatarMaterial({ spec, color }: { spec: MaterialSpec; color?: string }) {
  return (
    <meshPhysicalMaterial
      color={color ?? spec.color}
      roughness={spec.roughness}
      metalness={spec.metalness}
      clearcoat={spec.clearcoat}
      clearcoatRoughness={spec.clearcoatRoughness}
      flatShading={spec.flatShading}
      sheen={spec.roughness > 0.6 ? 0.35 : 0}
      sheenRoughness={0.8}
    />
  );
}
