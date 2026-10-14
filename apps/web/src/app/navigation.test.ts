import { describe, expect, it } from 'vitest';
import {
  companyNav,
  enterpriseNav,
  enterpriseRedirectPath,
  enterpriseStaysInWorkspace,
  isRouteHandle,
  workspaceBasePath,
  workspaceNav,
} from './navigation';

describe('companyNav', () => {
  it('genera rutas bajo /company/:companyId', () => {
    expect(companyNav('abc').map((item) => item.to)).toEqual([
      '/company/abc',
      '/company/abc/brand',
      '/company/abc/pixel',
      '/company/abc/manual',
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

  it('las rutas solo personales llevan al resumen de la empresa', () => {
    expect(enterpriseRedirectPath('/workspace/w1/personal/dna', company)).toBe(
      `/company/${company}`,
    );
  });

  it('un Pixel Personal: Inicio · Mi agenda · Trabajo (Proyectos, Tareas, Contenido) · Pixel', () => {
    expect(
      workspaceNav('w1', 'personal').map((group) => [
        group.label ?? null,
        group.items.map((item) => [item.label, item.to]),
      ]),
    ).toEqual([
      [
        null,
        [
          ['Inicio', '/workspace/w1'],
          // Prompt 20: «Mi agenda» justo debajo de Inicio.
          ['Mi agenda', '/workspace/w1/agenda'],
        ],
      ],
      [
        'Trabajo',
        [
          ['Proyectos', '/workspace/w1/projects'],
          ['Tareas', '/workspace/w1/tasks'],
          ['Contenido', '/workspace/w1/content'],
          ['Plan de contenido', '/workspace/w1/content-planner'],
        ],
      ],
      [
        'Pixel',
        [
          ['Mi ADN', '/workspace/w1/personal/dna'],
          ['Mi Pixel', '/workspace/w1/pixel'],
          ['Lo aprendido', '/workspace/w1/memory'],
        ],
      ],
    ]);
  });

  it('una empresa sin configurar (o un tipo aún desconocido) solo tiene el resumen', () => {
    const labels = (groups: ReturnType<typeof workspaceNav>) =>
      groups.flatMap((group) => group.items.map((item) => item.label));
    expect(labels(workspaceNav('w1', 'enterprise'))).toEqual(['Resumen']);
    expect(labels(workspaceNav('w1'))).toEqual(['Resumen']);
  });

  it('Operations de una empresa son workspace-first: se quedan en /workspace/:workspaceId', () => {
    for (const path of [
      '/workspace/w1/projects',
      '/workspace/w1/projects/p1',
      '/workspace/w1/tasks',
      '/workspace/w1/content',
    ]) {
      expect(enterpriseStaysInWorkspace(path)).toBe(true);
    }
  });

  it('el resto de rutas de una empresa redirige; Personal va al resumen; el Plan de contenido se queda', () => {
    for (const path of ['/workspace/w1', '/workspace/w1/chat', '/workspace/w1/pixel']) {
      expect(enterpriseStaysInWorkspace(path)).toBe(false);
    }
    expect(enterpriseStaysInWorkspace('/workspace/w1/personal/dna')).toBe(false);
    expect(enterpriseRedirectPath('/workspace/w1/personal/dna', company)).toBe(
      `/company/${company}`,
    );
    // Prompt 14: el Plan de contenido es workspace-first también en Enterprise.
    expect(enterpriseStaysInWorkspace('/workspace/w1/content-planner')).toBe(true);
    expect(enterpriseStaysInWorkspace('/workspace/w1/content-planner/p1')).toBe(true);
  });

  it('un Pixel de empresa: Inicio · Trabajo (Campañas, Plan de contenido, Proyectos, Tareas, Contenido) · Marca', () => {
    const groups = (companyId: string, workspaceId: string | null) =>
      enterpriseNav(companyId, workspaceId).map((group) => [
        group.label ?? null,
        group.items.map((item) => [item.label, item.to]),
      ]);
    expect(groups('c1', 'w1')).toEqual([
      [null, [['Inicio', '/company/c1']]],
      [
        'Trabajo',
        [
          ['Campañas', '/workspace/w1/campaigns'],
          ['Plan de contenido', '/workspace/w1/content-planner'],
          ['Proyectos', '/workspace/w1/projects'],
          ['Tareas', '/workspace/w1/tasks'],
          ['Contenido', '/workspace/w1/content'],
        ],
      ],
      [
        'Marca',
        [
          ['ADN de marca', '/company/c1/brand'],
          ['Brand Guardian', '/workspace/w1/guardian'],
          ['Lo aprendido', '/workspace/w1/memory'],
          ['Personaje', '/company/c1/pixel'],
        ],
      ],
    ]);
    // Sin el workspace aún (cargando) no hay enlaces rotos.
    expect(groups('c1', null).map(([label]) => label)).toEqual([null, 'Marca']);
  });

  it('workspaceNav de una empresa con empresa usa la navegación Enterprise', () => {
    expect(workspaceNav('w1', 'enterprise', 'c1')).toEqual(enterpriseNav('c1', 'w1'));
  });

  it('no depende de cómo venga escrito el id en la URL', () => {
    expect(enterpriseRedirectPath('/workspace/%3507f1f77bcf86cd799439021/chat', company)).toBe(
      `/company/${company}/chat`,
    );
  });
});
