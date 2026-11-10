import {
  CreateContentItemSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  type ContentFormat,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
  type CreateContentItemInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type Priority,
  type Project,
  type ProjectStatus,
  type ProjectType,
  type Task,
  type TaskStatus,
} from '@pixel/contracts';
import type { z } from 'zod';
import { zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { dateInputToIso, isoToDateInput } from './dates';

/*
 * Estado de los formularios de Operations (todo texto, como los inputs) y su conversión al
 * contrato de la API. La validación es la MISMA que aplica el servidor (schemas de contracts).
 */

export type FormResult<T> = { ok: true; input: T } | { ok: false; errors: FieldErrors };

function validate<T>(schema: z.ZodType, input: T): FormResult<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, input } : { ok: false, errors: zodFieldErrors(result.error) };
}

/* ---------- Project ---------- */

export interface ProjectFormState {
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  goals: string[];
  startDate: string;
  dueDate: string;
}

export const emptyProjectForm: ProjectFormState = {
  name: '',
  description: '',
  type: 'general',
  status: 'active',
  priority: 'medium',
  goals: [],
  startDate: '',
  dueDate: '',
};

export function projectToForm(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    type: project.type,
    status: project.status,
    priority: project.priority,
    goals: [...project.goals],
    startDate: isoToDateInput(project.startDate),
    dueDate: isoToDateInput(project.dueDate),
  };
}

/** Sirve para crear y para editar (PATCH con todos los campos del formulario). */
export function projectFormToInput(form: ProjectFormState): FormResult<CreateProjectInput> {
  return validate(CreateProjectSchema, {
    name: form.name,
    description: form.description,
    type: form.type,
    status: form.status,
    priority: form.priority,
    goals: form.goals,
    startDate: dateInputToIso(form.startDate),
    dueDate: dateInputToIso(form.dueDate),
  });
}

/* ---------- Task ---------- */

export interface TaskFormState {
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  estimatedMinutes: string;
}

export const emptyTaskForm: TaskFormState = {
  title: '',
  description: '',
  projectId: '',
  status: 'inbox',
  priority: 'medium',
  dueDate: '',
  estimatedMinutes: '',
};

export function taskToForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? '',
    projectId: task.projectId ?? '',
    status: task.status,
    priority: task.priority,
    dueDate: isoToDateInput(task.dueDate),
    estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
  };
}

export function taskFormToInput(form: TaskFormState): FormResult<CreateTaskInput> {
  const minutes = form.estimatedMinutes.trim();
  return validate(CreateTaskSchema, {
    title: form.title,
    description: form.description,
    projectId: form.projectId || null,
    status: form.status,
    priority: form.priority,
    dueDate: dateInputToIso(form.dueDate),
    estimatedMinutes: minutes ? Number(minutes) : null,
  });
}

/**
 * Quick Task: solo el título es obligatorio; proyecto, prioridad y fecha son opcionales. Una
 * tarea con fecha deja de ser "Inbox" y pasa a "Por hacer".
 */
export function quickTaskInput(form: {
  title: string;
  projectId?: string;
  priority?: Priority;
  dueDate?: string;
}): FormResult<CreateTaskInput> {
  const dueDate = dateInputToIso(form.dueDate ?? '');
  return validate(CreateTaskSchema, {
    title: form.title,
    projectId: form.projectId || null,
    priority: form.priority ?? 'medium',
    dueDate,
    status: dueDate || form.projectId ? 'todo' : 'inbox',
  });
}

/* ---------- ContentItem ---------- */

export interface ContentFormState {
  title: string;
  concept: string;
  objective: string;
  platform: ContentPlatform | '';
  format: ContentFormat | '';
  status: ContentStatus;
  hook: string;
  caption: string;
  script: string;
  notes: string;
  projectId: string;
  scheduledFor: string;
}

export const emptyContentForm: ContentFormState = {
  title: '',
  concept: '',
  objective: '',
  platform: '',
  format: '',
  status: 'idea',
  hook: '',
  caption: '',
  script: '',
  notes: '',
  projectId: '',
  scheduledFor: '',
};

export function contentToForm(item: ContentItem): ContentFormState {
  return {
    title: item.title,
    concept: item.concept ?? '',
    objective: item.objective ?? '',
    platform: item.platform ?? '',
    format: item.format ?? '',
    status: item.status,
    hook: item.hook ?? '',
    caption: item.caption ?? '',
    script: item.script ?? '',
    notes: item.notes ?? '',
    projectId: item.projectId ?? '',
    scheduledFor: isoToDateInput(item.scheduledFor),
  };
}

export function contentFormToInput(form: ContentFormState): FormResult<CreateContentItemInput> {
  return validate(CreateContentItemSchema, {
    title: form.title,
    concept: form.concept,
    objective: form.objective,
    platform: form.platform || null,
    format: form.format || null,
    status: form.status,
    hook: form.hook,
    caption: form.caption,
    script: form.script,
    notes: form.notes,
    projectId: form.projectId || null,
    scheduledFor: dateInputToIso(form.scheduledFor),
  });
}
