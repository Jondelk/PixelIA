import { describe, expect, it } from 'vitest';
import { companyNav, isRouteHandle } from './navigation';

describe('companyNav', () => {
  it('genera rutas bajo /company/:companyId', () => {
    expect(companyNav('abc').map((item) => item.to)).toEqual([
      '/company/abc',
      '/company/abc/brand',
      '/company/abc/pixel',
      '/company/abc/chat',
    ]);
  });

  it('escapa el companyId', () => {
    expect(companyNav('a/b')[0]?.to).toBe('/company/a%2Fb');
  });

  it('solo el resumen usa coincidencia exacta', () => {
    expect(companyNav('abc').filter((item) => item.end)).toHaveLength(1);
  });
});

describe('isRouteHandle', () => {
  it('reconoce handles válidos', () => {
    expect(isRouteHandle({ title: 'Chat', section: 'Empresa' })).toBe(true);
    expect(isRouteHandle(undefined)).toBe(false);
    expect(isRouteHandle({ title: 1 })).toBe(false);
  });
});
