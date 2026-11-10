import {
  CreateTaskSchema,
  ObjectIdSchema,
  UpdateTaskSchema,
  type CreateTaskData,
  type Task,
  type UpdateTaskData,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { z } from 'zod';
import { TaskModel, type TaskDocument } from '../../operations/task.model.js';
import { createTask, findTaskByActionKey, updateTask } from '../../operations/tasks.service.js';
import { defineCapability, type PixelTool, type ToolExecutionContext } from '../action.types.js';

/*
 * workspace.tasks (Prompt 18): tareas del workspace a través de `tasks.service` (proyecto del
 * MISMO workspace, `completedAt`, `source: pixel`). Sin CRUD propio.
 */

async function readTask(id: string | undefined, ctx: ToolExecutionContext) {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return TaskModel.findOne({ _id: new Types.ObjectId(id), workspaceId: ctx.workspace._id });
}

const sameId = (stored: Types.ObjectId | null | undefined, expected: string | null | undefined) =>
  (stored?.toString() ?? null) === (expected ?? null);

const createTaskCapability = defineCapability<CreateTaskData, Task>({
  key: 'create_task',
  description: 'Crear una tarea en este Pixel (opcionalmente dentro de un proyecto).',
  inputSchema: CreateTaskSchema,
  effect: 'create',
  target: 'internal',
  resourceKind: 'task',
  reversible: true,
  refFields: { projectId: 'project' },
  async execute(input, ctx) {
    // Idempotente por la clave de ESTA acción (nunca por el título): ver workspace.projects.
    const existing = await findTaskByActionKey(ctx.workspace, ctx.idempotencyKey);
    const task =
      existing ??
      (await createTask(ctx.workspace, input, { source: 'pixel', actionKey: ctx.idempotencyKey }));
    return {
      status: 'success',
      summary: existing
        ? `La tarea «${task.title}» ya la había creado esta acción.`
        : `Se creó la tarea «${task.title}».`,
      resourceRefs: [{ kind: 'task', id: task.id, label: task.title }],
      output: task,
    };
  },
  async verify(result, input, ctx) {
    const task = await readTask(result.resourceRefs[0]?.id, ctx);
    return Boolean(
      task &&
      task.title === input.title &&
      sameId(task.projectId, input.projectId) &&
      task.pixelActionKey === ctx.idempotencyKey,
    );
  },
});

export const UpdateTaskActionSchema = z
  .object({ taskId: ObjectIdSchema, changes: UpdateTaskSchema })
  .strict();
export type UpdateTaskAction = z.output<typeof UpdateTaskActionSchema>;

/** ¿La tarea guardada tiene los cambios pedidos? Compara solo los campos que se cambiaron. */
function hasChanges(task: TaskDocument, changes: UpdateTaskData): boolean {
  return Object.entries(changes).every(([field, value]) => {
    if (field === 'projectId') return sameId(task.projectId, value as string | null);
    if (field === 'dueDate') {
      const stored = task.dueDate ? task.dueDate.getTime() : null;
      return stored === (value ? new Date(value as string).getTime() : null);
    }
    if (field === 'tags') return JSON.stringify(task.tags) === JSON.stringify(value);
    return (task.get(field) ?? null) === (value ?? null);
  });
}

const updateTaskCapability = defineCapability<UpdateTaskAction, Task>({
  key: 'update_task',
  description: 'Cambiar una tarea existente de este Pixel (título, estado, fecha, prioridad…).',
  inputSchema: UpdateTaskActionSchema,
  effect: 'update',
  target: 'internal',
  resourceKind: 'task',
  // Cambiar fechas, estado o prioridad es información significativa: pide confirmación.
  significant: true,
  reversible: true,
  refFields: { taskId: 'task' },
  async execute(input, ctx) {
    const task = await updateTask(ctx.workspace, input.taskId, input.changes);
    return {
      status: 'success',
      summary: `Se actualizó la tarea «${task.title}».`,
      resourceRefs: [{ kind: 'task', id: task.id, label: task.title }],
      output: task,
    };
  },
  async verify(result, input, ctx) {
    const task = await readTask(result.resourceRefs[0]?.id, ctx);
    return Boolean(task && task._id.toString() === input.taskId && hasChanges(task, input.changes));
  },
});

export const workspaceTasksTool: PixelTool = {
  key: 'workspace.tasks',
  name: 'Tareas',
  description: 'Las tareas de este Pixel.',
  contextTypes: ['personal', 'enterprise'],
  feature: 'tasks',
  capabilities: [createTaskCapability, updateTaskCapability],
  availability: () => 'available',
};
