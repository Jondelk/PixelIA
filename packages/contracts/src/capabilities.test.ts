import { describe, expect, it } from 'vitest';
import {
  CreateProjectSchema,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES_BY_WORKSPACE,
  ProjectTypeSchema,
  WORKSPACE_FEATURES,
  workspaceCapabilities,
  workspaceSupportsFeature,
} from './index.js';

describe('Capacidades del workspace', () => {
  it('Operations es compartido; Content Planner y Daily Director solo Personal', () => {
    expect(workspaceCapabilities('personal')).toEqual({
      projects: true,
      tasks: true,
      content: true,
      contentPlanner: true,
      dailyDirector: true,
    });
    expect(workspaceCapabilities('enterprise')).toEqual({
      projects: true,
      tasks: true,
      content: true,
      contentPlanner: false,
      dailyDirector: false,
    });
  });

  it('workspaceSupportsFeature coincide con las capacidades derivadas', () => {
    for (const type of ['personal', 'enterprise'] as const) {
      for (const feature of WORKSPACE_FEATURES) {
        expect(workspaceSupportsFeature(type, feature)).toBe(workspaceCapabilities(type)[feature]);
      }
    }
  });

  it('las capacidades devueltas son una copia (no se pueden alterar desde fuera)', () => {
    const caps = workspaceCapabilities('enterprise');
    caps.dailyDirector = true;
    expect(workspaceSupportsFeature('enterprise', 'dailyDirector')).toBe(false);
  });
});

describe('Tipos de proyecto', () => {
  it('los tipos existentes siguen siendo válidos (compatibilidad)', () => {
    for (const type of ['general', 'content', 'client', 'creative', 'study', 'personal', 'other']) {
      expect(ProjectTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('acepta los tipos Enterprise y rechaza los desconocidos', () => {
    for (const type of ['campaign', 'branding', 'product_launch', 'event', 'internal']) {
      expect(CreateProjectSchema.parse({ name: 'Lanzamiento', type }).type).toBe(type);
    }
    expect(CreateProjectSchema.safeParse({ name: 'X', type: 'enterprise' }).success).toBe(false);
  });

  it('el tipo por defecto es general (nunca personal)', () => {
    expect(CreateProjectSchema.parse({ name: 'Lanzamiento 500 g' }).type).toBe('general');
  });

  it('cada tipo de workspace ofrece opciones válidas con etiqueta, empezando por general', () => {
    for (const options of Object.values(PROJECT_TYPES_BY_WORKSPACE)) {
      expect(options[0]).toBe('general');
      for (const type of options) expect(PROJECT_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(PROJECT_TYPES_BY_WORKSPACE.enterprise).not.toContain('personal');
    expect(PROJECT_TYPES_BY_WORKSPACE.enterprise).not.toContain('study');
    expect(PROJECT_TYPES_BY_WORKSPACE.personal).not.toContain('campaign');
  });
});
