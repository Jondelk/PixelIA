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
  section: 'General' | 'Empresa';
}

export const primaryNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/companies', label: 'Empresas', icon: 'companies' },
];

export function companyBasePath(companyId: string): string {
  return `/company/${encodeURIComponent(companyId)}`;
}

/** Navegación de una empresa: todo lo de una empresa vive bajo /company/:companyId. */
export function companyNav(companyId: string): NavItem[] {
  const base = companyBasePath(companyId);
  return [
    { to: base, label: 'Resumen', icon: 'overview', end: true },
    { to: `${base}/brand`, label: 'ADN de marca', icon: 'dna' },
    { to: `${base}/pixel`, label: 'Pixel', icon: 'pixel' },
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
