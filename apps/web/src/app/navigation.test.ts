import { describe, expect, it } from 'vitest';
import { companyNav, enterpriseRedirectPath, isRouteHandle, workspaceBasePath } from './navigation';

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

describe('rutas de workspace', () => {
  const company = '507f1f77bcf86cd799439011';

  it('la entrada de un Pixel es /workspace/:workspaceId', () => {
    expect(workspaceBasePath('abc')).toBe('/workspace/abc');
    expect(workspaceBasePath('a/b')).toBe('/workspace/a%2Fb');
  });

  it('un Pixel de empresa redirige a la misma subruta de su empresa', () => {
    expect(enterpriseRedirectPath('/workspace/w1', company)).toBe(`/company/${company}`);
    expect(enterpriseRedirectPath('/workspace/w1/', company)).toBe(`/company/${company}`);
    expect(enterpriseRedirectPath('/workspace/w1/chat', company)).toBe(`/company/${company}/chat`);
    expect(enterpriseRedirectPath('/workspace/w1/pixel', company)).toBe(
      `/company/${company}/pixel`,
    );
  });

  it('no depende de cómo venga escrito el id en la URL', () => {
    expect(enterpriseRedirectPath('/workspace/%3507f1f77bcf86cd799439021/chat', company)).toBe(
      `/company/${company}/chat`,
    );
  });
});
