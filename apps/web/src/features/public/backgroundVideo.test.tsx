import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { experienceImages, introVideo } from '../../brand/experience';
import { BackgroundVideo } from './BackgroundVideo';
import { shouldPlayVideo } from './videoPlayback';

describe('shouldPlayVideo', () => {
  it('reproduce por defecto salvo con movimiento reducido', () => {
    expect(shouldPlayVideo({ reducedMotion: false, choice: null, suspended: false })).toBe(true);
    expect(shouldPlayVideo({ reducedMotion: true, choice: null, suspended: false })).toBe(false);
  });

  it('respeta la elección del usuario, también con movimiento reducido', () => {
    expect(shouldPlayVideo({ reducedMotion: false, choice: 'pause', suspended: false })).toBe(
      false,
    );
    expect(shouldPlayVideo({ reducedMotion: true, choice: 'play', suspended: false })).toBe(true);
  });

  it('nunca reproduce mientras el modal de acceso lo tapa', () => {
    expect(shouldPlayVideo({ reducedMotion: false, choice: 'play', suspended: true })).toBe(false);
  });
});

describe('BackgroundVideo', () => {
  it('sin video configurado muestra solo el poster, sin controles', () => {
    const html = renderToStaticMarkup(<BackgroundVideo video={{ ...introVideo, src: null }} />);
    expect(html).toContain(introVideo.poster.src);
    expect(html).not.toContain('<video');
    expect(html).not.toContain('aria-label');
  });

  it('con video: silenciado, en bucle, inline, con poster y control de pausa accesible', () => {
    const html = renderToStaticMarkup(
      <BackgroundVideo
        video={{
          src: '/experience/intro.mp4',
          type: 'video/mp4',
          alternatives: [{ src: '/experience/intro.webm', type: 'video/webm' }],
          poster: experienceImages.enterprise.evolution,
        }}
      />,
    );
    expect(html).toMatch(/<video[^>]*\bmuted\b/);
    expect(html).toMatch(/<video[^>]*\bloop\b/);
    expect(html).toMatch(/<video[^>]*playsInline|<video[^>]*playsinline/);
    expect(html).toContain(`poster="${experienceImages.enterprise.evolution.src}"`);
    // La alternativa va antes que el MP4 para que el navegador elija la primera que soporte.
    expect(html.indexOf('intro.webm')).toBeLessThan(html.indexOf('intro.mp4'));
    expect(html).toContain('aria-label="Reproducir el video de fondo"');
  });
});
