import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import type { SceneSpec } from './sceneSpec';

/**
 * Iluminación de estudio estilizada: luz principal con sombras, contraluz del color de acento,
 * relleno suave y un environment procedural (Lightformers locales, sin descargar HDRIs).
 */
export function AvatarEnvironment({ spec }: { spec: SceneSpec }) {
  return (
    <>
      <hemisphereLight args={['#E6EEFF', '#1A1410', 0.55]} />
      <directionalLight
        position={[2.5, 4.5, 4]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2, -3.5]} intensity={1.6} color={spec.accentColor} />
      <pointLight position={[-2.5, 0.5, 3]} intensity={6} distance={10} color="#BFD4FF" />

      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 3, 4]} scale={[5, 2.5, 1]} />
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[-4, 1, 1]}
          rotation-y={Math.PI / 2}
          scale={[3, 3, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.5}
          color={spec.accentColor}
          position={[4, 1.5, -2]}
          scale={2}
        />
        <Lightformer
          form="rect"
          intensity={0.6}
          position={[0, -3, 0]}
          rotation-x={Math.PI / 2}
          scale={[8, 8, 1]}
          color="#2A1E14"
        />
      </Environment>

      <mesh rotation-x={-Math.PI / 2} position={[0, spec.groundY - 0.001, 0]} receiveShadow>
        <circleGeometry args={[2.6, 64]} />
        <shadowMaterial transparent opacity={0.22} />
      </mesh>
      <ContactShadows
        position={[0, spec.groundY, 0]}
        opacity={0.6}
        scale={5}
        blur={2.6}
        far={2.2}
        resolution={512}
        color="#000000"
      />
    </>
  );
}
