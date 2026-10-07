import type { WorkspaceType } from '@pixel/contracts';
import type { IconName } from '../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Activo solo con coincidencia exacta de ruta. */
  end?: boolean;
}

/** Metadatos de cada ruta (en `handle`) para el header. */
export interface RouteHandle {
  title: string;
  section: 'General' | 'Empresa' | 'Pixel';
}

export const primaryNav: NavItem[] = [
  { to: '/dashboard', label: 'Tus Pixels', icon: 'dashboard' },
  { to: '/companies', label: 'Empresas', icon: 'companies' },
];

/** Entrada única de cada Pixel (workspace). Enterprise redirige a sus rutas de empresa. */
export function workspaceBasePath(workspaceId: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}`;
}

/**
 * Navegación de un workspace según su tipo:
 * - personal: Inicio, Mi ADN, Mi Pixel y Chat (nada que aún no exista).
 * - enterprise sin empresa (o tipo aún desconocido): solo el resumen.
 * Enterprise con empresa navega bajo /company/:companyId (companyNav).
 */
export function workspaceNav(workspaceId: string, type: WorkspaceType | null = null): NavItem[] {
  const base = workspaceBasePath(workspaceId);
  if (type === 'personal') {
    return [
      { to: base, label: 'Inicio', icon: 'overview', end: true },
      { to: `${base}/personal/dna`, label: 'Mi ADN', icon: 'brand' },
      { to: `${base}/pixel`, label: 'Mi Pixel', icon: 'character' },
      { to: `${base}/chat`, label: 'Chat', icon: 'chat' },
    ];
  }
  return [{ to: base, label: 'Resumen', icon: 'overview', end: true }];
}

/**
 * Destino de /workspace/:workspaceId/<resto> para un Pixel de empresa: la misma subruta bajo
 * /company/:companyId. Se calcula por segmentos (no por longitud) porque el id de la URL puede venir
 * escrito de otra forma (p. ej. codificado) y seguir siendo el mismo workspace.
 */
export function enterpriseRedirectPath(pathname: string, companyId: string): string {
  const segments = pathname.split('/').filter(Boolean).slice(2);
  const target = companyBasePath(companyId);
  // Las rutas solo personales (/personal/...) no existen en una empresa: va a su resumen.
  if (segments.length === 0 || segments[0] === 'personal') return target;
  return `${target}/${segments.join('/')}`;
}

export function companyBasePath(companyId: string): string {
  return `/company/${encodeURIComponent(companyId)}`;
}

/** Navegación de una empresa: todo lo de una empresa vive bajo /company/:companyId. */
export function companyNav(companyId: string): NavItem[] {
  const base = companyBasePath(companyId);
  return [
    { to: base, label: 'Resumen', icon: 'overview', end: true },
    { to: `${base}/brand`, label: 'ADN de marca', icon: 'brand' },
    { to: `${base}/pixel`, label: 'Personaje', icon: 'character' },
    { to: `${base}/chat`, label: 'Chat', icon: 'chat' },
  ];
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RouteHandle).title === 'string' &&
    typeof (value as RouteHandle).section === 'string'
  );
}
