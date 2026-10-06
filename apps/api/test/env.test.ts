import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('separa múltiples orígenes CORS', () => {
    expect(loadEnv({ CORS_ORIGINS: 'http://a.com, http://b.com' }).CORS_ORIGINS).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });

  it('falla con un mensaje legible si hay valores inválidos', () => {
    expect(() => loadEnv({ PORT: 'abc', MONGODB_URI: 'postgres://x' })).toThrow(
      /PORT[\s\S]*MONGODB_URI/,
    );
  });
});
