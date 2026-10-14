/*
 * Contexto del Pixel Dock (Prompt 17): qué está viendo el usuario, a partir de la ruta. Es solo una
 * PISTA (tipo + id): el backend la valida contra el workspace y deriva de ella la campaña o el
 * proyecto; un id de otro workspace se rechaza. Nunca se envía a la IA como autoridad.
 */

export type DockResource = {
  type: 'campaign' | 'content_plan' | 'project' | 'content_item';
  id: string;
};

const ID = /^[a-f\d]{24}$/i;

const SEGMENT_TYPES: Record<string, DockResource['type']> = {
  campaigns: 'campaign',
  'content-planner': 'content_plan',
  projects: 'project',
};

/** /workspace/:id/campaigns/:campaignId → { campaign, campaignId } (o null). */
export function dockResourceFor(pathname: string): DockResource | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'workspace') return null;
  const type = SEGMENT_TYPES[segments[2] ?? ''];
  const id = segments[3];
  return type && id && ID.test(id) ? { type, id } : null;
}

const RESOURCE_COPY: Record<DockResource['type'], string> = {
  campaign: 'esta campaña',
  content_plan: 'este plan',
  project: 'este proyecto',
  content_item: 'esta pieza',
};

export const dockContextLabel = (resource: DockResource | null) =>
  resource ? `Con ${RESOURCE_COPY[resource.type]} en contexto` : null;

/**
 * Dónde NO aparece el Dock: el Inicio (ya tiene la entrada de Pixel), el chat (ya es la
 * conversación), los onboardings y lo que no es un workspace. Nada de duplicar la entrada.
 */
export function dockVisibleAt(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'workspace' && segments[0] !== 'company') return false;
  if (segments.length <= 2) return false;
  const rest = segments.slice(2).join('/');
  return !/^(?:chat|onboarding|personal\/onboarding)(?:\/|$)/.test(rest);
}
