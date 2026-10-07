import type { AvatarConcept } from '@pixel/contracts';
import { lazy, Suspense, useState } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Spinner } from '../../components/Spinner';
import { PixelPreview } from '../pixel/PixelPreview';
import type { AvatarState } from './pose';
import { supportsWebGL } from './webgl';

/** El renderer 3D (three.js) se descarga solo cuando se muestra un avatar. */
const PixelAvatar = lazy(() => import('./PixelAvatar'));

/**
 * Escena del Pixel lista para usar en cualquier página. Si no hay WebGL o la escena falla,
 * muestra la vista SVG provisional.
 */
export function AvatarStage({
  avatar,
  state,
  className,
  interactive = true,
}: {
  avatar: AvatarConcept & { id: string };
  state: AvatarState;
  className: string;
  interactive?: boolean;
}) {
  const [webgl] = useState(supportsWebGL);
  const fallback = (
    <PixelPreview
      key={avatar.id}
      profile={avatar}
      className={`relative mx-auto w-full max-w-sm ${className}`}
    />
  );
  if (!webgl) return fallback;
  return (
    <ErrorBoundary key={avatar.id} fallback={fallback}>
      <Suspense
        fallback={
          <div className={`relative grid place-items-center ${className}`} role="status">
            <Spinner className="size-6 text-accent" />
          </div>
        }
      >
        <PixelAvatar
          profile={avatar}
          state={state}
          interactive={interactive}
          className={`relative w-full touch-pan-y ${className}`}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
