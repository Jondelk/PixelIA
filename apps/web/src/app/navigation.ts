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

/** Enlaces de las funcionalidades de un workspace (siempre bajo /workspace/:workspaceId). */
function featureItems(workspaceId: string): [WorkspaceFeature, NavItem][] {
  const base = workspaceBasePath(workspaceId);
  return [
    ['campaigns', { to: `${base}/campaigns`, label: 'Campañas', icon: 'campaigns' }],
    [
      'contentPlanner',
      { to: `${base}/content-planner`, label: 'Plan de contenido', icon: 'planner' },
    ],
    ['projects', { to: `${base}/projects`, label: 'Proyectos', icon: 'projects' }],
    ['tasks', { to: `${base}/tasks`, label: 'Tareas', icon: 'tasks' }],
    ['content', { to: `${base}/content`, label: 'Contenido', icon: 'content' }],
    ['brandGuardian', { to: `${base}/guardian`, label: 'Brand Guardian', icon: 'guardian' }],
    [
      'creativeMemory',
      // Etiqueta corta en la barra lateral; la página se titula "Lo que Pixel ha aprendido".
      { to: `${base}/memory`, label: 'Lo aprendido', icon: 'memory' },
    ],
  ];
}

function navGroup(
  label: string,
  workspaceId: string,
  type: WorkspaceType,
  features: readonly WorkspaceFeature[],
): NavGroup {
  return {
    label,
    items: featureItems(workspaceId)
      .filter(([feature]) => features.includes(feature) && workspaceSupportsFeature(type, feature))
      .sort(([a], [b]) => features.indexOf(a) - features.indexOf(b))
      .map(([, item]) => item),
  };
}

/** Personal: todo su trabajo junto (Proyectos, Tareas, Contenido y Plan de contenido). */
function workNav(workspaceId: string, type: WorkspaceType): NavGroup {
  return navGroup('Trabajo', workspaceId, type, ['projects', 'tasks', 'content', 'contentPlanner']);
}

/**
 * Navegación de un workspace según su tipo:
 * - personal: Inicio · Mi agenda (Prompt 20) · Trabajo (Proyectos, Tareas, Contenido, Plan de
 *   contenido) · Pixel (Mi ADN, Mi Pixel, Lo aprendido). Chat se abre desde el Pixel Dock (Prompt 17).
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
      {
        items: [
          { to: base, label: 'Inicio', icon: 'overview', end: true },
          // «Mi agenda» justo debajo de Inicio: cómo está organizado tu tiempo (Prompt 20).
          ...(workspaceSupportsFeature(type, 'agenda')
            ? [{ to: `${base}/agenda`, label: 'Mi agenda', icon: 'planner' as const }]
            : []),
        ],
      },
      workNav(workspaceId, type),
      {
        label: 'Pixel',
        items: [
          { to: `${base}/personal/dna`, label: 'Mi ADN', icon: 'brand' },
          { to: `${base}/pixel`, label: 'Mi Pixel', icon: 'character' },
          // Creative Memory vive junto a Mi Pixel (sin otro grupo de navegación). Chat ya no está
          // en la navegación (Prompt 17): se habla con Pixel desde el Inicio o el Pixel Dock, que
          // enlaza a la conversación completa; la ruta /chat y sus conversaciones se conservan.
          ...navGroup('Pixel', workspaceId, type, ['creativeMemory']).items,
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
  guardian: 'brandGuardian',
  memory: 'creativeMemory',
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
    { to: `${base}/manual`, label: 'Manual de marca', icon: 'manual' },
    { to: `${base}/chat`, label: 'Chat', icon: 'chat' },
  ];
}

/**
 * Navegación de un Pixel de empresa (Prompt 14.1, menos ruido): Inicio — donde se le pide algo a
 * Pixel — · Trabajo (Campañas, Plan de contenido, Proyectos, Tareas, Contenido: el control
 * detallado, bajo /workspace/:workspaceId) · Marca (ADN, personaje y chat, todavía bajo
 * /company/:companyId). Sin workspaceId (aún cargando) se omite Trabajo.
 */
export function enterpriseNav(companyId: string, workspaceId: string | null): NavGroup[] {
  const [summary, dna, character] = companyNav(companyId);
  return [
    { items: [{ ...summary!, label: 'Inicio' }] },
    ...(workspaceId
      ? [
          navGroup('Trabajo', workspaceId, 'enterprise', [
            'campaigns',
            'contentPlanner',
            'projects',
            'tasks',
            'content',
          ]),
        ]
      : []),
    {
      label: 'Marca',
      // Marca (Prompt 17): ADN · Brand Guardian · Lo aprendido · Personaje, sin otro grupo de
      // navegación. Chat sale de la navegación: se abre desde el Pixel Dock («Ver la conversación
      // completa»); la ruta /company/:id/chat y sus conversaciones se conservan.
      items: [
        dna!,
        ...(workspaceId
          ? navGroup('Marca', workspaceId, 'enterprise', ['brandGuardian', 'creativeMemory']).items
          : []),
        character!,
      ],
    },
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
