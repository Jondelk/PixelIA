import { CreateProjectSchema, CreateTaskSchema } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { contentFixture, projectFixture, taskFixture } from '../../test/operationsFixtures';
import { countByStatus, isContentTab, itemsInStage } from './contentPipeline';
import { dateInputToIso, dayDiff, formatDay, isoToDateInput, isPastDay, todayInput } from './dates';
import { nextContentStatus, platformFormatLabel } from './labels';
import {
  contentFormToInput,
  emptyContentForm,
  emptyProjectForm,
  projectFormToInput,
  projectToForm,
  quickTaskInput,
  taskFormToInput,
  taskToForm,
} from './operationsForms';
import { isProjectFilter, projectFilterStatuses } from './projectFilters';
import {
  isTaskView,
  overdueFilters,
  taskViewFilters,
  toggledStatus,
  withOptimisticStatus,
} from './taskViews';

describe('fechas (día local ↔ UTC)', () => {
  it('un día del input se guarda como su mediodía local y vuelve al mismo día', () => {
    const iso = dateInputToIso('2026-10-15');
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getHours()).toBe(12);
    expect(isoToDateInput(iso)).toBe('2026-10-15');
    expect(dateInputToIso('')).toBeNull();
    expect(dateInputToIso('15/10/2026')).toBeNull();
    expect(isoToDateInput(null)).toBe('');
  });

  it('formatea relativo a hoy', () => {
    const now = new Date(2026, 9, 7, 9, 0);
    const day = (offset: number) => new Date(2026, 9, 7 + offset, 18, 0).toISOString();
    expect(formatDay(day(0), now)).toBe('Hoy');
    expect(formatDay(day(1), now)).toBe('Mañana');
    expect(formatDay(day(-1), now)).toBe('Ayer');
    expect(formatDay(day(8), now)).toMatch(/^15 oct/);
    expect(formatDay(new Date(2027, 0, 3, 12).toISOString(), now)).toMatch(/2027/);
    expect(dayDiff(day(3), now)).toBe(3);
    expect(isPastDay(day(-1), now)).toBe(true);
    expect(isPastDay(day(0), now)).toBe(false);
    expect(todayInput(now)).toBe('2026-10-07');
  });
});

describe('formularios → contratos', () => {
  it('crear proyecto: basta el nombre y el payload cumple el contrato', () => {
    const result = projectFormToInput({ ...emptyProjectForm, name: 'Marca personal' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(CreateProjectSchema.parse(result.input)).toMatchObject({
      name: 'Marca personal',
      status: 'active',
      startDate: null,
    });
  });

  it('sin nombre devuelve el error del campo', () => {
    expect(projectFormToInput(emptyProjectForm)).toEqual({
      ok: false,
      errors: { name: 'Escribe el nombre del proyecto' },
    });
  });

  it('valida las fechas del proyecto igual que la API', () => {
    const result = projectFormToInput({
      ...emptyProjectForm,
      name: 'X',
      startDate: '2026-10-10',
      dueDate: '2026-10-01',
    });
    expect(result.ok ? null : result.errors.dueDate).toMatch(/anterior/);
  });

  it('editar un proyecto parte de sus datos', () => {
    const form = projectToForm(projectFixture({ dueDate: dateInputToIso('2026-12-01') }));
    expect(form).toMatchObject({ name: 'Marca personal', dueDate: '2026-12-01' });
  });

  it('Quick Task: inbox sin fecha ni proyecto; "Por hacer" si tiene alguno', () => {
    const inbox = quickTaskInput({ title: '  Grabar intro ' });
    expect(inbox.ok && CreateTaskSchema.parse(inbox.input)).toMatchObject({
      title: 'Grabar intro',
      status: 'inbox',
    });
    const dated = quickTaskInput({ title: 'X', dueDate: '2026-10-08', priority: 'high' });
    expect(dated.ok && dated.input).toMatchObject({ status: 'todo', priority: 'high' });
    expect(quickTaskInput({ title: ' ' }).ok).toBe(false);
  });

  it('editor de tarea: ida y vuelta sin perder datos', () => {
    const task = taskFixture({ estimatedMinutes: 30, projectId: '64b7f0c2a1b2c3d4e5f60010' });
    const result = taskFormToInput(taskToForm(task));
    expect(result.ok && result.input).toMatchObject({
      title: task.title,
      estimatedMinutes: 30,
      projectId: task.projectId,
      status: 'todo',
    });
    expect(taskFormToInput({ ...taskToForm(task), estimatedMinutes: '0' }).ok).toBe(false);
  });

  it('crear contenido: basta el título; vacíos → null', () => {
    const result = contentFormToInput({ ...emptyContentForm, title: 'Reel', platform: 'tiktok' });
    expect(result.ok && result.input).toMatchObject({
      title: 'Reel',
      platform: 'tiktok',
      format: null,
      projectId: null,
      status: 'idea',
    });
    expect(contentFormToInput(emptyContentForm).ok).toBe(false);
  });
});

describe('vistas y filtros', () => {
  it('cada vista de tareas es un filtro de la API', () => {
    expect(taskViewFilters('inbox')).toEqual({ status: ['inbox'] });
    expect(taskViewFilters('today')).toEqual({ status: ['inbox', 'todo', 'doing'], due: 'today' });
    expect(taskViewFilters('upcoming').due).toBe('upcoming');
    expect(taskViewFilters('done')).toEqual({ status: ['done'] });
    expect(taskViewFilters('all')).toEqual({ status: ['inbox', 'todo', 'doing'] });
    expect(overdueFilters.due).toBe('overdue');
    expect(isTaskView('today')).toBe(true);
    expect(isTaskView('kanban')).toBe(false);
  });

  it('completar / reabrir y el estado optimista', () => {
    expect(toggledStatus('todo')).toBe('done');
    expect(toggledStatus('inbox')).toBe('done');
    expect(toggledStatus('done')).toBe('todo');
    const tasks = [taskFixture(), taskFixture({ id: '64b7f0c2a1b2c3d4e5f60021' })];
    const shown = withOptimisticStatus(tasks, { [tasks[0]!.id]: 'done' });
    expect(shown.map((task) => task.status)).toEqual(['done', 'todo']);
    expect(shown[1]).toBe(tasks[1]);
  });

  it('filtros de proyectos: "Todos" excluye archivados (lo decide la API)', () => {
    expect(projectFilterStatuses('all')).toBeUndefined();
    expect(projectFilterStatuses('archived')).toEqual(['archived']);
    expect(isProjectFilter('active')).toBe(true);
    expect(isProjectFilter('deleted')).toBe(false);
  });

  it('pipeline de contenido: conteos, orden y siguiente etapa', () => {
    const items = [
      contentFixture({ id: '64b7f0c2a1b2c3d4e5f60031', status: 'idea' }),
      contentFixture({
        id: '64b7f0c2a1b2c3d4e5f60032',
        status: 'idea',
        scheduledFor: '2026-10-20T17:00:00.000Z',
      }),
      contentFixture({ id: '64b7f0c2a1b2c3d4e5f60033', status: 'review' }),
    ];
    expect(countByStatus(items)).toMatchObject({ idea: 2, review: 1, production: 0 });
    expect(itemsInStage(items, 'idea').map((item) => item.id)).toEqual([
      '64b7f0c2a1b2c3d4e5f60032',
      '64b7f0c2a1b2c3d4e5f60031',
    ]);
    expect(nextContentStatus('idea')).toBe('planned');
    expect(nextContentStatus('ready')).toBe('published');
    expect(nextContentStatus('published')).toBeNull();
    expect(nextContentStatus('archived')).toBeNull();
    expect(isContentTab('archived')).toBe(true);
    expect(isContentTab('calendar')).toBe(false);
    expect(platformFormatLabel(contentFixture())).toBe('Instagram · Reel');
    expect(platformFormatLabel(contentFixture({ platform: null, format: null }))).toBeNull();
  });
});
