import type { ContentItem, Project, Task } from '@pixel/contracts';

/** Datos de prueba con la forma exacta de los contratos (para tests de vistas y clientes). */

export const WORKSPACE_ID = '64b7f0c2a1b2c3d4e5f60001';
export const OTHER_WORKSPACE_ID = '64b7f0c2a1b2c3d4e5f60099';
const NOW = '2026-10-07T15:00:00.000Z';

export function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: '64b7f0c2a1b2c3d4e5f60010',
    workspaceId: WORKSPACE_ID,
    campaignId: null,
    name: 'Marca personal',
    description: 'Construir mi marca como fotógrafo',
    type: 'personal',
    status: 'active',
    priority: 'high',
    goals: ['Publicar 3 veces por semana'],
    startDate: null,
    dueDate: null,
    progress: 50,
    stats: { tasks: 2, completedTasks: 1, contentItems: 1 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: '64b7f0c2a1b2c3d4e5f60020',
    workspaceId: WORKSPACE_ID,
    projectId: null,
    title: 'Grabar intro',
    description: null,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    estimatedMinutes: null,
    tags: [],
    source: 'manual',
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function contentFixture(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: '64b7f0c2a1b2c3d4e5f60030',
    workspaceId: WORKSPACE_ID,
    projectId: null,
    campaignId: null,
    title: 'Cómo construí Pixel Personal',
    concept: null,
    objective: null,
    platform: 'instagram',
    format: 'reel',
    status: 'production',
    hook: null,
    caption: null,
    script: null,
    notes: null,
    scheduledFor: null,
    publishedAt: null,
    tags: [],
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export const noop = async () => {};
