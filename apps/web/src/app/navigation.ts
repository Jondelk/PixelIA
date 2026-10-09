import {
  workspaceSupportsFeature,
  type WorkspaceFeature,
  type WorkspaceType,
} from '@pixel/contracts';
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
  section: 'General' | 'Empresa' | 'Pixel' | 'Trabajo';
}

export const primaryNav: NavItem[] = [
  { to: '/dashboard', label: 'Tus Pixels', icon: 'dashboard' },
  { to: '/companies', label: 'Empresas', icon: 'companies' },
];

/** Entrada única de cada Pixel (workspace). Enterprise redirige a sus rutas de empresa salvo Trabajo. */
export function workspaceBasePath(workspaceId: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}`;
}

/** Grupo de la navegación lateral (sin `label`: va arriba, sin título). */
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Sección Trabajo de un workspace: Operations compartidas (Proyectos, Tareas, Contenido) y, si el
 * tipo lo admite, el Plan de contenido. Siempre bajo /workspace/:workspaceId (workspace-first).
 */
function workNav(workspaceId: string, type: WorkspaceType): NavGroup {
  const base = workspaceBasePath(workspaceId);
  const items: [WorkspaceFeature, NavItem][] = [
    ['campaigns', { to: `${base}/campaigns`, label: 'Campañas', icon: 'campaigns' }],
    ['projects', { to: `${base}/projects`, label: 'Proyectos', icon: 'projects' }],
    ['tasks', { to: `${base}/tasks`, label: 'Tareas', icon: 'tasks' }],
    ['content', { to: `${base}/content`, label: 'Contenido', icon: 'content' }],
    [
      'contentPlanner',
      { to: `${base}/content-planner`, label: 'Plan de contenido', icon: 'planner' },
    ],
  ];
  return {
    label: 'Trabajo',
    items: items
      .filter(([feature]) => workspaceSupportsFeature(type, feature))
      .map(([, item]) => item),
  };
}

/**
 * Navegación de un workspace según su tipo:
 * - personal: Inicio · Trabajo (Proyectos, Tareas, Contenido, Plan de contenido) · Pixel (Mi ADN,
 *   Mi Pixel, Chat).
 * - enterprise con empresa: la de la empresa (enterpriseNav).
 * - enterprise sin empresa (o tipo aún desconocido): solo el resumen.
 */
export function workspaceNav(
  workspaceId: string,
  type: WorkspaceType | null = null,
  companyId: string | null = null,
): NavGroup[] {
  const base = workspaceBasePath(workspaceId);
  if (type === 'enterprise' && companyId) return enterpriseNav(companyId, workspaceId);
  if (type === 'personal') {
    return [
      { items: [{ to: base, label: 'Inicio', icon: 'overview', end: true }] },
      workNav(workspaceId, type),
      {
        label: 'Pixel',
        items: [
          { to: `${base}/personal/dna`, label: 'Mi ADN', icon: 'brand' },
          { to: `${base}/pixel`, label: 'Mi Pixel', icon: 'character' },
          { to: `${base}/chat`, label: 'Chat', icon: 'chat' },
        ],
      },
    ];
  }
  return [{ items: [{ to: base, label: 'Resumen', icon: 'overview', end: true }] }];
}

/** Subrutas de /workspace/:workspaceId que no existen bajo /company/:companyId. */
const WORKSPACE_ONLY_SEGMENTS = new Set([
  'personal',
  'campaigns',
  'projects',
  'tasks',
  'content',
  'content-planner',
]);

/** Primer segmento de /workspace/:workspaceId/<segmento> → funcionalidad que lo sirve. */
const SEGMENT_FEATURES: Record<string, WorkspaceFeature> = {
  campaigns: 'campaigns',
  projects: 'projects',
  tasks: 'tasks',
  content: 'content',
  'content-planner': 'contentPlanner',
};

/**
 * ¿Esta ruta de un Pixel de empresa vive en /workspace/:workspaceId? Sí para las funcionalidades
 * workspace-first que Enterprise admite (Operations). El resto sigue en /company/:companyId.
 */
export function enterpriseStaysInWorkspace(pathname: string): boolean {
  const feature = SEGMENT_FEATURES[pathname.split('/').filter(Boolean)[2] ?? ''];
  return feature !== undefined && workspaceSupportsFeature('enterprise', feature);
}

/**
 * Destino de /workspace/:workspaceId/<resto> para un Pixel de empresa: la misma subruta bajo
 * /company/:companyId. Se calcula por segmentos (no por longitud) porque el id de la URL puede venir
 * escrito de otra forma (p. ej. codificado) y seguir siendo el mismo workspace.
 */
export function enterpriseRedirectPath(pathname: string, companyId: string): string {
  const segments = pathname.split('/').filter(Boolean).slice(2);
  const target = companyBasePath(companyId);
  // Las rutas solo personales (/personal/...), el Plan de contenido y las de Operations (que viven en
  // /workspace, ver enterpriseStaysInWorkspace) no existen bajo la empresa: van a su resumen.
  if (segments.length === 0 || WORKSPACE_ONLY_SEGMENTS.has(segments[0]!)) return target;
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

/**
 * Navegación de un Pixel de empresa: Inicio · Trabajo (Campañas y Operations, bajo
 * /workspace/:workspaceId) · Marca (ADN, personaje y chat, todavía bajo /company/:companyId). Sin
 * workspaceId (aún cargando) se omite Trabajo.
 */
export function enterpriseNav(companyId: string, workspaceId: string | null): NavGroup[] {
  const [summary, ...brand] = companyNav(companyId);
  return [
    { items: [{ ...summary!, label: 'Inicio' }] },
    ...(workspaceId ? [workNav(workspaceId, 'enterprise')] : []),
    { label: 'Marca', items: brand },
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
