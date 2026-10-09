import { describe, expect, it } from 'vitest';
import {
  ContentItemListQuerySchema,
  CreateContentItemSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  ProjectListQuerySchema,
  TaskListQuerySchema,
  UpdateProjectSchema,
  UpdateTaskSchema,
} from './index.js';

const workspaceId = '507f1f77bcf86cd799439011';

describe('Project', () => {
  it('basta el nombre: el resto toma valores por defecto', () => {
    expect(CreateProjectSchema.parse({ name: '  Marca personal ' })).toEqual({
      name: 'Marca personal',
      description: null,
      type: 'general',
      status: 'active',
      priority: 'medium',
      goals: [],
      startDate: null,
      dueDate: null,
      campaignId: null,
    });
  });

  it('rechaza workspaceId, progress o source en el cuerpo', () => {
    for (const extra of [{ workspaceId }, { progress: 80 }, { source: 'pixel' }]) {
      expect(CreateProjectSchema.safeParse({ name: 'X', ...extra }).success).toBe(false);
    }
    expect(UpdateProjectSchema.safeParse({ workspaceId }).success).toBe(false);
  });

  it('la fecha límite no puede ser anterior al inicio', () => {
    const result = CreateProjectSchema.safeParse({
      name: 'X',
      startDate: '2026-10-10T12:00:00.000Z',
      dueDate: '2026-10-01T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['dueDate']);
  });

  it('una actualización vacía es inválida', () => {
    expect(UpdateProjectSchema.safeParse({}).success).toBe(false);
  });

  it('el filtro de estado acepta listas separadas por comas o repetidas', () => {
    expect(ProjectListQuerySchema.parse({ status: 'active,planned' }).status).toEqual([
      'active',
      'planned',
    ]);
    expect(ProjectListQuerySchema.parse({ status: ['active', 'completed'] }).status).toEqual([
      'active',
      'completed',
    ]);
    expect(ProjectListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(ProjectListQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(ProjectListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});

describe('Task', () => {
  it('Quick Task: basta el título y entra al inbox', () => {
    expect(CreateTaskSchema.parse({ title: 'Grabar intro' })).toMatchObject({
      title: 'Grabar intro',
      status: 'inbox',
      priority: 'medium',
      projectId: null,
      tags: [],
    });
    expect(CreateTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('completedAt y source los gestiona el servidor', () => {
    expect(
      CreateTaskSchema.safeParse({ title: 'X', completedAt: '2026-10-01T00:00:00.000Z' }).success,
    ).toBe(false);
    expect(UpdateTaskSchema.safeParse({ source: 'pixel' }).success).toBe(false);
  });

  it('valida projectId y etiquetas', () => {
    expect(CreateTaskSchema.safeParse({ title: 'X', projectId: 'abc' }).success).toBe(false);
    expect(CreateTaskSchema.parse({ title: 'X', tags: ['Video', 'video', ' '] }).tags).toEqual([
      'Video',
    ]);
  });

  it('filtros: estado, proyecto, vencimiento y zona horaria', () => {
    expect(
      TaskListQuerySchema.parse({
        status: 'inbox,todo',
        projectId: workspaceId,
        due: 'today',
        tzOffset: '300',
      }),
    ).toMatchObject({
      status: ['inbox', 'todo'],
      projectId: workspaceId,
      due: 'today',
      tzOffset: 300,
    });
    expect(TaskListQuerySchema.safeParse({ due: 'yesterday' }).success).toBe(false);
    expect(TaskListQuerySchema.safeParse({ projectId: { $ne: null } }).success).toBe(false);
  });
});

describe('ContentItem', () => {
  it('basta el título y empieza como idea', () => {
    expect(CreateContentItemSchema.parse({ title: 'Cómo construí Pixel' })).toMatchObject({
      title: 'Cómo construí Pixel',
      status: 'idea',
      platform: null,
      format: null,
      hook: null,
    });
  });

  it('valida plataforma y formato', () => {
    expect(CreateContentItemSchema.safeParse({ title: 'X', platform: 'myspace' }).success).toBe(
      false,
    );
    expect(
      ContentItemListQuerySchema.parse({ platform: 'instagram', format: 'reel' }),
    ).toMatchObject({ platform: 'instagram', format: 'reel' });
  });
});
