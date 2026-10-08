import type { WorkspaceType } from './workspace.js';

/*
 * Capacidades de un Workspace: qué funcionalidades de Pixel están disponibles según su tipo.
 * Se DERIVAN del tipo (nunca se guardan en Mongo) y son la única fuente de verdad del feature
 * gating, tanto en la API (400 feature_not_available) como en la web (navegación y rutas).
 *
 * - Operations (projects, tasks, content): compartidas por ambos tipos (Shared Workspace Operations).
 * - Content Planner y Daily Director: solo Personal por ahora (dependen del PersonalDNA).
 */

export const WORKSPACE_FEATURES = [
  'projects',
  'tasks',
  'content',
  'contentPlanner',
  'dailyDirector',
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
  },
  enterprise: {
    projects: true,
    tasks: true,
    content: true,
    contentPlanner: false,
    dailyDirector: false,
  },
};

export function workspaceSupportsFeature(type: WorkspaceType, feature: WorkspaceFeature): boolean {
  return CAPABILITIES[type][feature];
}

export function workspaceCapabilities(type: WorkspaceType): WorkspaceCapabilities {
  return { ...CAPABILITIES[type] };
}
