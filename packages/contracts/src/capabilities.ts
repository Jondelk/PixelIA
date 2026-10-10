import type { WorkspaceType } from './workspace.js';

/*
 * Capacidades de un Workspace: qué funcionalidades de Pixel están disponibles según su tipo.
 * Se DERIVAN del tipo (nunca se guardan en Mongo) y son la única fuente de verdad del feature
 * gating, tanto en la API (400 feature_not_available) como en la web (navegación y rutas).
 *
 * - Operations (projects, tasks, content): compartidas por ambos tipos (Shared Workspace Operations).
 * - Content Planner: ambos (Personal desde el PersonalDNA; Enterprise desde el BrandDNA y, si se
 *   elige, una campaña). Daily Director: solo Personal por ahora.
 * - Campaign Manager: solo Enterprise (depende del BrandDNA).
 * - Brand Guardian (Prompt 15): solo Enterprise (revisa contra el BrandDNA; Personal no lo tiene).
 */

export const WORKSPACE_FEATURES = [
  'projects',
  'tasks',
  'content',
  'contentPlanner',
  'dailyDirector',
  'campaigns',
  'brandGuardian',
] as const;
export type WorkspaceFeature = (typeof WORKSPACE_FEATURES)[number];

export type WorkspaceCapabilities = Record<WorkspaceFeature, boolean>;

const CAPABILITIES: Record<WorkspaceType, WorkspaceCapabilities> = {
  personal: {
    projects: true,
    tasks: true,
    content: true,
    contentPlanner: true,
    dailyDirector: true,
    campaigns: false,
    brandGuardian: false,
  },
  enterprise: {
    projects: true,
    tasks: true,
    content: true,
    contentPlanner: true,
    dailyDirector: false,
    campaigns: true,
    brandGuardian: true,
  },
};

export function workspaceSupportsFeature(type: WorkspaceType, feature: WorkspaceFeature): boolean {
  return CAPABILITIES[type][feature];
}

export function workspaceCapabilities(type: WorkspaceType): WorkspaceCapabilities {
  return { ...CAPABILITIES[type] };
}
