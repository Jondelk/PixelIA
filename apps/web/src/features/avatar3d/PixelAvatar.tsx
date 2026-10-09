import type { AvatarConcept } from '@pixel/contracts';
import { PresentationControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AvatarController } from './AvatarController';
import { AvatarEnvironment } from './AvatarEnvironment';
import type { AvatarState } from './pose';
import { profileToScene, type AvatarProfileInput, type SceneSpec } from './sceneSpec';

const FOV = 30;

/**
 * Encuadra al personaje completo (con accesorios y gestos) en cualquier proporción de
 * lienzo: calcula la distancia por alto y por ancho y usa la mayor.
 */
function ResponsiveCamera({ spec }: { spec: SceneSpec }) {
  const { camera, size } = useThree();
  const top = spec.body.halfHeight + 0.55;
  const bottom = spec.groundY - 0.15;
  const halfWidth = spec.body.halfWidth + spec.limbs.armLength + 0.35;

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const byHeight = (((top - bottom) / 2) * 1.12) / tan;
    const byWidth = (halfWidth * 1.12) / (tan * aspect);
    const distance = Math.max(byHeight, byWidth);
    const centerY = (top + bottom) / 2;
    camera.position.set(0, centerY + distance * 0.06, distance);
    camera.lookAt(0, centerY, 0);
  }, [camera, size.width, size.height, top, bottom, halfWidth]);
  return null;
}

export interface PixelAvatarProps {
  profile: AvatarProfileInput | AvatarConcept;
  state?: AvatarState;
  className?: string;
  /** Permite girar el personaje con límites (vuelve solo a la vista frontal). */
  interactive?: boolean;
}

/**
 * Renderer 3D de Pixel. Recibe un AvatarProfile y lo dibuja con primitivas paramétricas.
 * No contiene reglas de negocio: solo traduce el perfil (profileToScene) y anima estados.
 */
export function PixelAvatar({
  profile,
  state = 'idle',
  className,
  interactive = true,
}: PixelAvatarProps) {
  const spec = useMemo(() => profileToScene(profile), [profile]);

  return (
    <Canvas
      className={className}
      shadows="percentage"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0.5, 7] }}
      aria-label={`Avatar 3D de ${profile.name}`}
      role="img"
    >
      <ResponsiveCamera spec={spec} />
      <AvatarEnvironment spec={spec} />
      <PresentationControls
        enabled={interactive}
        global={false}
        cursor
        snap
        speed={1.4}
        zoom={1}
        rotation={[0, -0.18, 0]}
        polar={[-0.08, 0.18]}
        azimuth={[-0.75, 0.75]}
      >
        <AvatarController spec={spec} state={state} />
      </PresentationControls>
    </Canvas>
  );
}

export default PixelAvatar;
