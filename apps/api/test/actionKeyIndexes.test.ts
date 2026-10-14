import { CreateProjectSchema, CreateTaskSchema } from '@pixel/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createApp } from '../src/app.js';
import { getDatabaseStatus, runCriticalMaintenance } from '../src/db/connection.js';
import { EXPLICIT_INDEX_MODELS } from '../src/db/indexedModels.js';
import { createLogger } from '../src/lib/logger.js';
import {
  ACTION_KEY_INDEX,
  ActionKeyIndexError,
  ensureActionKeyIndexes,
  missingActionKeyIndexes,
} from '../src/modules/operations/operations.indexes.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { createProject } from '../src/modules/operations/projects.service.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { createTask } from '../src/modules/operations/tasks.service.js';
import type { WorkspaceDocument } from '../src/modules/workspaces/workspace.model.js';
import { testEnv, useTestDatabase } from './support/testApp.js';

/*
 * Prompt 18: los índices de idempotencia de las acciones de Pixel se crean de forma EXPLÍCITA (al
 * arrancar la API y en `migrate:workspaces`), no solo por el autoIndex de Mongoose.
 */

useTestDatabase();

const actionKeyIndex = async (model: typeof ProjectModel | typeof TaskModel) =>
  (await model.collection.indexes()).find((index) => index.name === ACTION_KEY_INDEX);

/** Lo mismo que hace `migrate:workspaces` (con y sin `--sync-indexes`). */
async function runScriptIndexStep(sync: boolean) {
  for (const model of EXPLICIT_INDEX_MODELS) {
    if (sync) await model.syncIndexes();
    else await model.createIndexes();
  }
}

/** Una base «de producción» sin el índice nuevo y con datos legacy (sin pixelActionKey). */
async function legacyDatabase() {
  for (const model of [ProjectModel, TaskModel]) {
    await model.createCollection().catch(() => undefined);
    await model.collection.dropIndexes();
  }
  const workspaceId = new Types.ObjectId();
  const now = new Date();
  const project = (name: string) => ({
    workspaceId,
    campaignId: null,
    name,
    description: null,
    type: 'general',
    status: 'active',
    priority: 'medium',
    goals: [],
    startDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  });
  const task = (title: string) => ({
    workspaceId,
    projectId: null,
    title,
    description: null,
    status: 'inbox',
    priority: 'medium',
    dueDate: null,
    estimatedMinutes: null,
    tags: [],
    source: 'manual',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  // Dos iguales y sin clave: un índice único NO parcial chocaría con ellos.
  await ProjectModel.collection.insertMany([project('Legacy'), project('Legacy')]);
  await TaskModel.collection.insertMany([task('Legacy'), task('Legacy')]);
  return workspaceId;
}

const snapshot = async () =>
  JSON.stringify([
    await ProjectModel.collection.find().sort({ _id: 1 }).toArray(),
    await TaskModel.collection.find().sort({ _id: 1 }).toArray(),
  ]);

describe('Índices de idempotencia: explícitos, únicos, parciales y seguros con lo legacy', () => {
  it('el mecanismo explícito de migrate:workspaces incluye Project y Task', () => {
    expect(EXPLICIT_INDEX_MODELS).toContain(ProjectModel);
    expect(EXPLICIT_INDEX_MODELS).toContain(TaskModel);
  });

  it('sin el índice y con datos legacy: el paso del script lo crea en projects y tasks (único y parcial) sin tocar documentos; repetirlo no falla', async () => {
    await legacyDatabase();
    expect((await missingActionKeyIndexes()).sort()).toEqual(['projects', 'tasks']);
    const before = await snapshot();

    await runScriptIndexStep(false);
    await runScriptIndexStep(false);
    // Con --sync-indexes, también dos veces.
    await runScriptIndexStep(true);
    await runScriptIndexStep(true);

    expect(await missingActionKeyIndexes()).toEqual([]);
    for (const model of [ProjectModel, TaskModel]) {
      expect(await actionKeyIndex(model)).toMatchObject({
        key: { workspaceId: 1, pixelActionKey: 1 },
        unique: true,
        partialFilterExpression: { pixelActionKey: { $type: 'string' } },
      });
    }
    // Ningún documento cambió ni se borró.
    expect(await snapshot()).toBe(before);
  });

  it('ensureActionKeyIndexes (arranque de la API): idempotente y reiniciable', async () => {
    await legacyDatabase();
    await ensureActionKeyIndexes();
    await ensureActionKeyIndexes();
    expect(await missingActionKeyIndexes()).toEqual([]);
    // Si se pierde (p. ej. un despliegue lo borró), el siguiente arranque lo recrea.
    await TaskModel.collection.dropIndex(ACTION_KEY_INDEX);
    expect(await missingActionKeyIndexes()).toEqual(['tasks']);
    await ensureActionKeyIndexes();
    expect(await missingActionKeyIndexes()).toEqual([]);
  });

  it('con el índice: lo legacy convive, lo manual sin clave se repite sin chocar y la misma clave no se duplica', async () => {
    const legacyWorkspace = await legacyDatabase();
    await ensureActionKeyIndexes();
    expect(
      await ProjectModel.countDocuments({ workspaceId: legacyWorkspace, name: 'Legacy' }),
    ).toBe(2);

    // Los servicios solo usan el _id del workspace (ya autorizado por la ruta).
    const workspace = { _id: new Types.ObjectId(), type: 'personal' } as WorkspaceDocument;
    const manual = CreateProjectSchema.parse({ name: 'Manual' });
    await createProject(workspace, manual);
    await createProject(workspace, manual);
    await createTask(workspace, CreateTaskSchema.parse({ title: 'A mano' }));
    await createTask(workspace, CreateTaskSchema.parse({ title: 'A mano' }));
    expect(await ProjectModel.countDocuments({ workspaceId: workspace._id, name: 'Manual' })).toBe(
      2,
    );
    expect(await TaskModel.countDocuments({ workspaceId: workspace._id, title: 'A mano' })).toBe(2);

    // La garantía que da el índice (sin pasar por la búsqueda previa del servicio).
    await ProjectModel.collection.insertOne({
      workspaceId: workspace._id,
      name: 'X',
      pixelActionKey: 'k',
    });
    await expect(
      ProjectModel.collection.insertOne({
        workspaceId: workspace._id,
        name: 'X',
        pixelActionKey: 'k',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('Arranque: los índices de idempotencia son mantenimiento CRÍTICO (fail closed)', () => {
  const appWithRealStatus = () =>
    createApp({
      env: testEnv,
      logger: createLogger({ level: 'silent', format: 'json' }),
      getDatabaseStatus,
      ai: new DemoProvider(),
    });

  it('base sin los índices: el arranque los crea y verifica, y la API queda lista', async () => {
    await legacyDatabase();
    const onFailure = vi.fn();
    expect(await runCriticalMaintenance(ensureActionKeyIndexes, onFailure)).toBe(true);
    expect(onFailure).not.toHaveBeenCalled();
    expect(await missingActionKeyIndexes()).toEqual([]);
    expect(getDatabaseStatus()).toBe('connected');
    await request(appWithRealStatus()).get('/api/auth/me').expect(401);
  });

  it('si no se pueden garantizar (datos que ya violan la unicidad): la API NO queda operativa', async () => {
    await legacyDatabase();
    const workspaceId = new Types.ObjectId();
    // Dos tareas con la MISMA clave (imposible con el índice): el índice único no puede crearse.
    await TaskModel.collection.insertMany([
      { workspaceId, title: 'A', pixelActionKey: 'k' },
      { workspaceId, title: 'B', pixelActionKey: 'k' },
    ]);
    const onFailure = vi.fn();
    expect(await runCriticalMaintenance(ensureActionKeyIndexes, onFailure)).toBe(false);
    const [err] = onFailure.mock.calls[0]!;
    expect(err).toBeInstanceOf(ActionKeyIndexError);
    expect(err.collection).toBe('tasks');
    expect(err.message).toMatch(
      /workspace_pixel_action_key_unique.*«tasks».*no puede garantizar la idempotencia/,
    );
    // No operativa: la base no cuenta como lista y la compuerta rechaza el tráfico normal.
    expect(getDatabaseStatus()).toBe('connecting');
    const app = appWithRealStatus();
    const res = await request(app).get('/api/auth/me').expect(503);
    expect(res.body.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      details: { reason: 'database_not_ready' },
    });
    await request(app).post('/api/auth/login').send({}).expect(503);
    // /api/health sigue respondiendo (degradado) para el orquestador.
    const health = await request(app).get('/api/health').expect(503);
    expect(health.body.status).toBe('degraded');
    // Nada se borró para «arreglarlo».
    expect(await TaskModel.collection.countDocuments({ pixelActionKey: 'k' })).toBe(2);
    // Restablece el estado para los tests siguientes.
    await TaskModel.collection.deleteMany({ pixelActionKey: 'k' });
    expect(await runCriticalMaintenance(ensureActionKeyIndexes)).toBe(true);
  });

  it('un índice con el mismo nombre y otra configuración no se da por válido: se repara sin tocar datos', async () => {
    await legacyDatabase();
    await ensureActionKeyIndexes();
    await TaskModel.collection.dropIndex(ACTION_KEY_INDEX);
    // Mismo nombre, NO único y sin filtro parcial.
    await TaskModel.collection.createIndex(
      { workspaceId: 1, pixelActionKey: 1 },
      { name: ACTION_KEY_INDEX },
    );
    expect(await missingActionKeyIndexes()).toEqual(['tasks']);
    const before = await snapshot();
    expect(await ensureActionKeyIndexes()).toEqual(['tasks']);
    expect(await missingActionKeyIndexes()).toEqual([]);
    expect(await snapshot()).toBe(before);
    // Ya correcto: no se vuelve a reparar.
    expect(await ensureActionKeyIndexes()).toEqual([]);
  });
});
