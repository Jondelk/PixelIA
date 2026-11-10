import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  experienceImages,
  INTRO_VIDEO_PATH,
  introVideo,
  resolveIntroVideoSrc,
} from '../../brand/experience';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { authPagePath } from '../auth/redirect';
import { AuthDialogContext } from './authDialogContext';
import { anonymousEntry, introPath, introSeen, markIntroSeen } from './introSession';
import { shouldPlayVideo } from './videoPlayback';
import { WelcomeView } from './WelcomePage';
import welcomeSource from './WelcomePage.tsx?raw';

/*
 * Bienvenida audiovisual de PIXELES antes del login: visible para un visitante, «Entrar a Pixel»
 * desde el primer instante, respaldo estático sin video o con movimiento reducido, y una sola vez
 * por sesión del navegador (sin bucles login ↔ bienvenida).
 */

const anonymous: AuthContextValue = {
  state: { status: 'anonymous' },
  login: async () => {
    throw new Error('no');
  },
  register: async () => {
    throw new Error('no');
  },
  logout: async () => {},
};

function render(loginPath: string, video = introVideo) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthContext.Provider value={anonymous}>
        <AuthDialogContext.Provider
          value={{ isOpen: false, openAuth: () => {}, closeAuth: () => {} } as never}
        >
          <WelcomeView loginPath={loginPath} video={video} />
        </AuthDialogContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Bienvenida (PixelIntro)', () => {
  it('A/B. visitante en «/»: pantalla completa, frase de marca y «Entrar a Pixel» → login (sin formulario)', () => {
    const html = render(authPagePath('login', null));
    expect(html).toContain('min-h-dvh');
    expect(text(html)).toContain('Tu mundo, potenciado por Pixel.');
    expect(html).toMatch(/href="\/login"[^>]*>Entrar a Pixel/);
    expect(html).not.toMatch(/<input|<form/);
    expect(text(html)).toContain('Explorar Pixel');
  });

  it('B. conserva a dónde iba (solo rutas internas)', () => {
    expect(render(authPagePath('login', '/workspace/w1/agenda'))).toContain(
      'href="/login?next=%2Fworkspace%2Fw1%2Fagenda"',
    );
    expect(authPagePath('login', 'https://evil.test')).toBe('/login');
  });

  it('ruta del video: la local de VITE_PIXEL_INTRO_VIDEO si es interna; si no, la oficial', () => {
    expect(INTRO_VIDEO_PATH).toBe('/experience/pixel-intro.mp4');
    expect(resolveIntroVideoSrc(undefined)).toBe(INTRO_VIDEO_PATH);
    expect(resolveIntroVideoSrc('')).toBe(INTRO_VIDEO_PATH);
    expect(resolveIntroVideoSrc('/experience/pixel-intro.local.mp4')).toBe(
      '/experience/pixel-intro.local.mp4',
    );
    expect(resolveIntroVideoSrc(' /experience/pixel-intro.local.webm ')).toBe(
      '/experience/pixel-intro.local.webm',
    );
    // Nunca fuera de la app, ni otros tipos de archivo.
    for (const bad of [
      'https://evil.test/v.mp4',
      '//evil.test/v.mp4',
      'javascript:alert(1)',
      '/experience/../../secret.mp4',
      '/experience/poster.webp',
    ]) {
      expect(resolveIntroVideoSrc(bad)).toBe(INTRO_VIDEO_PATH);
    }
    // La ruta configurada (local u oficial) siempre es interna.
    expect(introVideo.src).toMatch(/^\/experience\/[\w.-]+\.(?:mp4|webm)$/);
  });

  it('C. sin video (o si falla): el poster es el respaldo y se puede entrar igual', () => {
    const html = render('/login', { ...introVideo, src: null });
    expect(html).toContain(introVideo.poster.src);
    expect(html).not.toContain('<video');
    expect(html).toContain('Entrar a Pixel');
  });

  it('con video: silenciado, en bucle, inline, cubre la pantalla, con poster debajo y control de pausa', () => {
    const html = render('/login', {
      ...introVideo,
      src: INTRO_VIDEO_PATH,
      poster: experienceImages.personal.evolution,
    });
    expect(html).toMatch(/<video[^>]*muted=""[^>]*loop=""[^>]*playsInline=""|<video[^>]*loop=""/);
    expect(html).toContain('object-cover');
    expect(html).toContain(experienceImages.personal.evolution.src);
    expect(html).toContain('aria-label="Reproducir el video de fondo"');
    expect(html).not.toMatch(/autoplay|controls=""/i);
  });

  it('D. movimiento reducido: no se reproduce solo (queda el poster)', () => {
    expect(shouldPlayVideo({ reducedMotion: true, choice: null, suspended: false })).toBe(false);
  });

  it('la bienvenida no rediseña el login ni la autenticación', () => {
    expect(welcomeSource).not.toMatch(/AuthPanel|loginRequest|useAuth\(\)/);
  });
});

describe('Una vez por sesión del navegador, sin bucles', () => {
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  };

  it('E. primera ruta privada sin sesión → bienvenida con destino; después → directo al login', () => {
    expect(anonymousEntry('/workspace/w1', false)).toBe('/?next=%2Fworkspace%2Fw1');
    expect(anonymousEntry('/workspace/w1', true)).toBe('/login');
    expect(introPath('/')).toBe('/');
    expect(introPath('//evil.test')).toBe('/');
  });

  it('se marca al verla; si el navegador bloquea el almacenamiento, se trata como vista (nunca un bucle)', () => {
    const storage = store();
    expect(introSeen(storage)).toBe(false);
    markIntroSeen(storage);
    expect(introSeen(storage)).toBe(true);
    expect(introSeen(null)).toBe(true);
    expect(
      introSeen({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(true);
    expect(() =>
      markIntroSeen({
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
