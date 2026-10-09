import { describe, expect, it } from 'vitest';
import { authPagePath, DEFAULT_AFTER_AUTH, nextAfterAuth, safeNextPath } from './redirect';
import { visualKindForNext } from './visualKind';

describe('safeNextPath: solo destinos internos tras el acceso', () => {
  it('acepta rutas internas con query y hash', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/pixels/start?intent=personal')).toBe('/pixels/start?intent=personal');
    expect(safeNextPath('/workspace/abc/chat#hoy')).toBe('/workspace/abc/chat#hoy');
  });

  it('rechaza URLs externas, protocol-relative y protocolos peligrosos', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example/dashboard',
      '/\\evil.example',
      'javascript:alert(1)',
      'evil.example/dashboard',
      '',
      '   ',
    ]) {
      expect(safeNextPath(value), value).toBeNull();
    }
  });

  it('rechaza caracteres de control que el navegador podría ignorar', () => {
    expect(safeNextPath('/\t/evil.example')).toBeNull();
    expect(safeNextPath('/dash\nboard')).toBeNull();
  });

  it('rechaza lo que no es texto', () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath({ pathname: '/dashboard' })).toBeNull();
  });
});

describe('nextAfterAuth', () => {
  it('usa el primer destino seguro y, si no hay, el dashboard', () => {
    expect(nextAfterAuth('//evil.example', '/workspace/abc')).toBe('/workspace/abc');
    expect(nextAfterAuth(null, undefined)).toBe(DEFAULT_AFTER_AUTH);
  });
});

describe('authPagePath', () => {
  it('conserva el destino al cambiar entre /login y /register', () => {
    expect(authPagePath('register', '/pixels/start?intent=enterprise')).toBe(
      '/register?next=%2Fpixels%2Fstart%3Fintent%3Denterprise',
    );
    expect(authPagePath('login', DEFAULT_AFTER_AUTH)).toBe('/login');
    expect(authPagePath('login', 'https://evil.example')).toBe('/login');
  });
});

describe('visualKindForNext', () => {
  it('elige el personaje según la intención del destino', () => {
    expect(visualKindForNext('/pixels/start?intent=enterprise')).toBe('enterprise');
    expect(visualKindForNext('/pixels/start?intent=personal')).toBe('personal');
    expect(visualKindForNext('/dashboard')).toBe('personal');
    expect(visualKindForNext(null)).toBe('personal');
  });
});
