import type { AvatarConcept } from '@pixel/contracts';
import { PresentationControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { AvatarController } from './AvatarController';
import { AvatarEnvironment } from './AvatarEnvironment';
import { SculptedAvatarModel, type ModelBounds } from './SculptedAvatarModel';
import type { AvatarState } from './pose';
import { profileToScene, type AvatarProfileInput, type SceneSpec } from './sceneSpec';

const FOV = 30;

function parametricBounds(spec: SceneSpec): ModelBounds {
  return {
    top: spec.body.halfHeight + 0.55,
    bottom: spec.groundY - 0.15,
    halfWidth: spec.body.halfWidth + spec.limbs.armLength + 0.35,
  };
}

/**
 * Encuadra al personaje completo (con accesorios y gestos) en cualquier proporción de
 * lienzo: calcula la distancia por alto y por ancho y usa la mayor.
 */
function ResponsiveCamera({ bounds }: { bounds: ModelBounds }) {
  const { camera, size } = useThree();
  const { top, bottom, halfWidth } = bounds;

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
  reducedMotion?: boolean;
  /**
   * Modelo del personaje esculpido en 3D (.glb). Mientras carga, o si falla, se muestra
   * el avatar paramétrico.
   */
  modelUrl?: string | null;
}

/**
 * Renderer 3D de Pixel. Con modelo esculpido muestra ese modelo; si no, dibuja el AvatarProfile
 * con primitivas paramétricas. No contiene reglas de negocio: solo traduce y anima estados.
 */
export function PixelAvatar({
  profile,
  state = 'idle',
  className,
  interactive = true,
  reducedMotion = false,
  modelUrl = null,
}: PixelAvatarProps) {
  const spec = useMemo(() => profileToScene(profile), [profile]);
  const [model, setModel] = useState<{ url: string; bounds: ModelBounds } | null>(null);
  const modelBounds = model && model.url === modelUrl ? model.bounds : null;
  const onBounds = useCallback(
    (bounds: ModelBounds) => {
      if (modelUrl) setModel({ url: modelUrl, bounds });
    },
    [modelUrl],
  );

  const parametric = (
    <AvatarController spec={spec} state={state} reducedMotion={reducedMotion} />
  );
  // El modelo esculpido apoya los pies en y = 0; el paramétrico, en spec.groundY.
  const groundY = modelBounds ? 0 : spec.groundY;

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
      <ResponsiveCamera bounds={modelBounds ?? parametricBounds(spec)} />
      <AvatarEnvironment accentColor={spec.accentColor} groundY={groundY} />
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
        {modelUrl ? (
          <ErrorBoundary key={modelUrl} fallback={parametric}>
            <Suspense fallback={parametric}>
              <SculptedAvatarModel
                url={modelUrl}
                motion={spec.motion}
                state={state}
                reducedMotion={reducedMotion}
                onBounds={onBounds}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          parametric
        )}
      </PresentationControls>
    </Canvas>
  );
}

export default PixelAvatar;
