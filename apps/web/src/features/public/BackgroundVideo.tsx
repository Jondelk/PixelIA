import { useEffect, useRef, useState } from 'react';
import type { introVideo as IntroVideo } from '../../brand/experience';
import { ExperienceImg } from '../../components/ExperienceImg';
import { Icon } from '../../components/Icon';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';
import { shouldPlayVideo, type VideoChoice } from './videoPlayback';

/**
 * Fondo de video a pantalla completa, siempre sin sonido. El poster queda debajo como base: se ve
 * mientras carga, si no hay video configurado, si falla o si el navegador bloquea la reproducción
 * automática. El botón de pausa solo aparece cuando hay un video utilizable.
 */
export function BackgroundVideo({
  video,
  suspended = false,
  controlClassName = 'bottom-6 right-6',
}: {
  video: typeof IntroVideo;
  suspended?: boolean;
  controlClassName?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState<VideoChoice>(null);
  const [playing, setPlaying] = useState(false);
  const usable = video.src !== null && !failed;
  const play = shouldPlayVideo({ reducedMotion, choice, suspended });

  useEffect(() => {
    const element = ref.current;
    if (!element || !usable) return;
    // El atributo `muted` de React no basta en todos los navegadores para permitir el autoplay.
    element.muted = true;
    element.defaultMuted = true;
    if (play) {
      // Si el navegador no permite reproducir, se queda el poster y el botón ofrece reproducir.
      element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  }, [usable, play]);

  // Se reproduce o pausa dentro del clic: si el navegador bloqueó la reproducción automática, `play`
  // ya valía true y el efecto no volvería a ejecutarse; el gesto del usuario sí la permite.
  function toggle() {
    const element = ref.current;
    if (!element) return;
    if (playing) {
      setChoice('pause');
      element.pause();
    } else {
      setChoice('play');
      element.play().catch(() => setPlaying(false));
    }
  }

  const sources = video.src ? [...video.alternatives, { src: video.src, type: video.type }] : [];
  const { poster } = video;

  return (
    <>
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <ExperienceImg
          image={poster}
          sizes="100vw"
          priority
          decorative
          className="size-full object-cover"
        />
        {usable && (
          <video
            ref={ref}
            muted
            loop
            playsInline
            // Con movimiento reducido no se descarga hasta que el usuario lo pida.
            preload={play ? 'auto' : 'none'}
            poster={poster.src}
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: poster.focus }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setFailed(true)}
          >
            {sources.map((source, index) => (
              <source
                key={source.src}
                src={source.src}
                type={source.type}
                // Si falla la última fuente, ninguna sirve: se vuelve al poster.
                onError={index === sources.length - 1 ? () => setFailed(true) : undefined}
              />
            ))}
          </video>
        )}
      </div>
      {usable && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pausar el video de fondo' : 'Reproducir el video de fondo'}
          title={playing ? 'Pausar video' : 'Reproducir video'}
          className={`absolute z-20 grid size-11 place-items-center rounded-lg border border-blanco/30 bg-negro-cine/60 text-blanco transition-colors hover:bg-negro-cine/80 ${controlClassName}`}
        >
          <Icon name={playing ? 'pause' : 'play'} className="size-5" />
        </button>
      )}
    </>
  );
}
