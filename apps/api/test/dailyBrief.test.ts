import {
  DailyBriefListResponseSchema,
  DailyBriefResponseSchema,
  localDateIn,
  type DailyBriefGeneration,
} from '@pixel/contracts';
import mongoose, { type Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { DailyBriefModel } from '../src/modules/daily-director/dailyBrief.model.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { createCompany } from './support/brandBrain.js';
import { creativeDirector } from './fixtures/personal.js';
import { createContent, createProject, createTask, ops } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;
const brief = (workspaceId: string) => `/api/workspaces/${workspaceId}/daily-brief`;
const briefs = (workspaceId: string) => `/api/workspaces/${workspaceId}/daily-briefs`;

/** Mediodía en Bogotá de un día relativo a hoy (convención de Operations). */
function dayAt(offset: number): string {
  const today = localDateIn(new Date(), 'America/Bogota');
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offset, 17)).toISOString();
}

async function personalPixel(session: Session) {
  const workspaceId = await createPersonalWorkspace(session);
  await completePersonalOnboarding(session, workspaceId, creativeDirector);
  return workspaceId;
}

/** Proveedor "real" controlado: elige las 3 primeras refs y cuenta llamadas. */
function countingAi(): AIProvider & { calls: number } {
  const provider: AIProvider & { calls: number } = {
    name: 'scripted',
    model: 'scripted-1',
    mode: 'ai',
    calls: 0,
    generateText: () =>
      Promise.resolve({
        text: 'ok',
        provider: 'scripted',
        model: 'scripted-1',
        mode: 'ai',
        latencyMs: 1,
      }),
    async generateStructuredOutput(request) {
      provider.calls += 1;
      const refs = [...request.prompt.matchAll(/"ref":"(TASK_\d+)"/g)].map((match) => match[1]!);
      const data: DailyBriefGeneration = {
        summary: 'Hoy tienes entregas cercanas: empezaría por lo que vence antes.',
        priorities: refs.slice(0, 3).map((ref) => ({
          ref,
          rationale: 'Es lo que vence antes entre tus tareas abiertas.',
          suggestedAction: null,
        })),
        contentSuggestion: null,
        focusBlocks: [],
        closingNote: null,
      };
      return {
        data: request.schema.parse(data),
        provider: 'scripted',
        model: 'scripted-1',
        mode: 'ai',
        latencyMs: 2,
      };
    },
  };
  return provider;
}

describe('Daily Director: generar, persistir y detectar cambios', () => {
  it('sin brief → 404 daily_brief_not_generated; generar → 201 y GET devuelve el mismo sin llamar a la IA', async () => {
    const ai = countingAi();
    const aiApp = buildTestApp(ai);
    const jhon = await registerUser(aiApp, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    await createTask(jhon, workspaceId, {
      title: 'Editar reel',
      priority: 'high',
      dueDate: dayAt(1),
    });

    const before = ai.calls; // el onboarding ya usó la IA (enriquecimiento del ADN)
    const missing = await jhon.agent.get(brief(workspaceId)).expect(404);
    expect(missing.body.error.details).toMatchObject({
      reason: 'daily_brief_not_generated',
      timezone: 'America/Bogota',
    });

    const generated = DailyBriefResponseSchema.parse(
      (await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201)).body,
    );
    expect(generated).toMatchObject({
      stale: false,
      brief: {
        version: 1,
        generationMode: 'ai',
        contextType: 'personal',
        personalDnaVersion: 1,
        timezone: 'America/Bogota',
      },
    });
    expect(generated.brief.generation).toMatchObject({
      provider: 'scripted',
      model: 'scripted-1',
      fallbackReason: null,
    });
    expect(ai.calls - before).toBe(1);

    for (let i = 0; i < 3; i += 1) {
      const again = await jhon.agent.get(brief(workspaceId)).expect(200);
      expect(again.body.brief.id).toBe(generated.brief.id);
      expect(again.body.stale).toBe(false);
    }
    expect(ai.calls - before).toBe(1);
  });

  it('modo demo: brief determinístico; completar una tarea → stale; regenerar → v2 sin esa prioridad', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    const urgent = await createTask(jhon, workspaceId, {
      title: 'Entregar propuesta',
      priority: 'high',
      dueDate: dayAt(0),
    });
    await createTask(jhon, workspaceId, { title: 'Ordenar archivos' });

    const first = (await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201)).body.brief;
    expect(first).toMatchObject({
      generationMode: 'deterministic',
      generation: { fallbackReason: 'demo' },
    });
    expect(first.priorities[0]).toMatchObject({
      title: 'Entregar propuesta',
      resourceId: urgent.id,
      urgency: 'high',
    });
    expect(first.priorities[0].rationale).toBe('Vence hoy y es de prioridad alta.');

    await jhon.agent
      .patch(`${ops(workspaceId).tasks}/${urgent.id}`)
      .send({ status: 'done' })
      .expect(200);
    const stale = await jhon.agent.get(brief(workspaceId)).expect(200);
    expect(stale.body).toMatchObject({ stale: true, brief: { id: first.id } });

    const second = (await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201)).body;
    expect(second.brief.version).toBe(2);
    expect(second.brief.priorities.map((p: { title: string }) => p.title)).not.toContain(
      'Entregar propuesta',
    );
    expect((await jhon.agent.get(brief(workspaceId)).expect(200)).body).toMatchObject({
      stale: false,
      brief: { version: 2 },
    });
  });

  it('un borrado también marca stale (huella de conteos)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    const t = await createTask(jhon, workspaceId, { title: 'Borrable' });
    await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201);
    await TaskModel.deleteOne({ _id: t.id, workspaceId });
    expect((await jhon.agent.get(brief(workspaceId)).expect(200)).body.stale).toBe(true);
  });

  it('sin trabajo registrado: brief honesto, sin prioridades inventadas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    const res = await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201);
    expect(res.body.brief).toMatchObject({
      priorities: [],
      focusBlocks: [],
      contentSuggestion: null,
      generation: { fallbackReason: 'no_work' },
    });
    expect(res.body.brief.summary).toMatch(/Aún no tienes suficiente trabajo registrado/);
  });

  it('doble clic: dos generaciones simultáneas producen una sola versión', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    await createTask(jhon, workspaceId, { title: 'Una' });
    const [a, b] = await Promise.all([
      jhon.agent.post(`${brief(workspaceId)}/generate`),
      jhon.agent.post(`${brief(workspaceId)}/generate`),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.brief.id).toBe(b.body.brief.id);
    expect(await DailyBriefModel.countDocuments({ workspaceId })).toBe(1);
  });

  it('historial paginado y brief por id', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    await createTask(jhon, workspaceId, { title: 'Una' });
    const v1 = (await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201)).body.brief;
    await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201);
    const list = DailyBriefListResponseSchema.parse(
      (await jhon.agent.get(`${briefs(workspaceId)}?limit=1`).expect(200)).body,
    );
    expect(list).toMatchObject({ total: 2, briefs: [{ version: 2 }] });
    expect(
      (await jhon.agent.get(`${briefs(workspaceId)}/${v1.id}`).expect(200)).body.brief.version,
    ).toBe(1);
    const missing = await jhon.agent
      .get(`${briefs(workspaceId)}/507f1f77bcf86cd799439011`)
      .expect(404);
    expect(missing.body.error.details.reason).toBe('daily_brief_not_found');
  });

  it('la zona horaria del workspace define el día; una zona inválida es 400', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    await jhon.agent
      .patch(`/api/workspaces/${workspaceId}`)
      .send({ timezone: 'Marte/Olympus' })
      .expect(400);
    const updated = await jhon.agent
      .patch(`/api/workspaces/${workspaceId}`)
      .send({ timezone: 'Asia/Tokyo' })
      .expect(200);
    expect(updated.body.workspace.timezone).toBe('Asia/Tokyo');
    const res = await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201);
    expect(res.body.brief).toMatchObject({
      timezone: 'Asia/Tokyo',
      localDate: localDateIn(new Date(), 'Asia/Tokyo'),
    });
  });

  it('escenario realista: entrega de mañana, tarea alta de hoy y contenido listo para mañana', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    const a = await createProject(jhon, workspaceId, { name: 'Proyecto A', dueDate: dayAt(1) });
    const b = await createProject(jhon, workspaceId, { name: 'Proyecto B', dueDate: dayAt(10) });
    await createTask(jhon, workspaceId, { title: 'A1', projectId: a.id, status: 'todo' });
    await createTask(jhon, workspaceId, { title: 'A2', projectId: a.id, status: 'todo' });
    for (let i = 1; i <= 5; i += 1)
      await createTask(jhon, workspaceId, { title: `B${i}`, projectId: b.id });
    const solo = await createTask(jhon, workspaceId, {
      title: 'Independiente',
      priority: 'high',
      dueDate: dayAt(0),
    });
    const piece = await createContent(jhon, workspaceId, {
      title: 'Reel de lanzamiento',
      status: 'ready',
      scheduledFor: dayAt(1),
    });

    const { brief: result } = (await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201))
      .body;
    const ids = result.priorities.map((p: { resourceId: string }) => p.resourceId);
    expect(result.priorities.length).toBeLessThanOrEqual(3);
    expect(ids).toContain(solo.id);
    // El proyecto A (mañana, 2 abiertas) está en riesgo y lo dice un aviso con hechos.
    expect(result.warnings.map((w: { message: string }) => w.message)).toContain(
      '«Proyecto A» vence mañana y todavía tiene 2 tareas abiertas.',
    );
    // Ninguna prioridad es del proyecto B (10 días, sano).
    expect(
      result.priorities.map((p: { title: string }) => p.title).some((t: string) => /^B\d$/.test(t)),
    ).toBe(false);
    // El contenido existente (listo, para mañana) se sugiere: no una idea nueva.
    expect(result.contentSuggestion).toMatchObject({
      contentItemId: piece.id,
      suggestedAction: 'publish',
    });
    expect(result.facts).toMatchObject({ openTasks: 8, dueToday: 1 });
    // Todos los ids referenciados existen en el workspace, en la colección de su tipo.
    const models = { task: TaskModel, project: ProjectModel, content: ContentItemModel } as const;
    for (const priority of result.priorities as {
      type: keyof typeof models;
      resourceId: string;
    }[]) {
      const model = models[priority.type] as unknown as Model<Record<string, unknown>>;
      expect(await model.exists({ _id: priority.resourceId, workspaceId })).toBeTruthy();
    }
  });
});

describe('Daily Director: errores, Enterprise y aislamiento', () => {
  it('sin PersonalDNA → 409; Enterprise → 400 feature_not_available', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const empty = await createPersonalWorkspace(jhon);
    const res = await jhon.agent.post(`${brief(empty)}/generate`).expect(409);
    expect(res.body.error.details.reason).toBe('personal_context_not_configured');
    const companyId = await createCompany(jhon, 'TINTO');
    const enterprise = (await workspaceIdOf(companyId)).toString();
    for (const request of [
      () => jhon.agent.get(brief(enterprise)),
      () => jhon.agent.post(`${brief(enterprise)}/generate`),
      () => jhon.agent.get(briefs(enterprise)),
    ]) {
      const response = await request();
      expect(response.status).toBe(400);
      expect(response.body.error.details.reason).toBe('feature_not_available');
    }
  });

  it('B no puede leer, generar ni ver el historial de A (404); A no ve tareas de B', async () => {
    const userA = await registerUser(app, 'Usuario A');
    const userB = await registerUser(app, 'Usuario B');
    const workspaceA = await personalPixel(userA);
    const workspaceB = await personalPixel(userB);
    const taskB = await createTask(userB, workspaceB, {
      title: 'Secreto de B',
      priority: 'high',
      dueDate: dayAt(0),
    });
    const briefA = (await userA.agent.post(`${brief(workspaceA)}/generate`).expect(201)).body.brief;

    for (const attempt of [
      () => userB.agent.get(brief(workspaceA)),
      () => userB.agent.post(`${brief(workspaceA)}/generate`),
      () => userB.agent.get(briefs(workspaceA)),
      () => userB.agent.get(`${briefs(workspaceA)}/${briefA.id}`),
      () => userB.agent.get(`${briefs(workspaceB)}/${briefA.id}`),
    ]) {
      expect((await attempt()).status).toBe(404);
    }
    expect(JSON.stringify(briefA)).not.toContain('Secreto de B');
    expect(JSON.stringify(briefA)).not.toContain(taskB.id);
  });

  it('tenantScoped: DailyBrief exige workspaceId concreto; índice único por día y versión', async () => {
    const model = DailyBriefModel as unknown as Model<Record<string, unknown>>;
    await expect(model.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(model.find({ workspaceId: { $ne: null } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(model.find({ workspaceId: new mongoose.Types.ObjectId() })).resolves.toEqual([]);
    expect(
      (await DailyBriefModel.collection.indexes()).map((index) => [
        index.key,
        index.unique ?? false,
      ]),
    ).toEqual([
      [{ _id: 1 }, false],
      [{ workspaceId: 1, localDate: -1, version: -1 }, true],
    ]);
  });
});

describe('Chat Personal con la dirección del día', () => {
  it('"¿Qué hago primero?" responde desde el brief vigente (demo)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await personalPixel(jhon);
    await createTask(jhon, workspaceId, {
      title: 'Entregar propuesta',
      priority: 'high',
      dueDate: dayAt(0),
    });
    await jhon.agent.post(`${brief(workspaceId)}/generate`).expect(201);
    const conv = await jhon.agent.post(`/api/workspaces/${workspaceId}/conversations`).expect(201);
    const res = await jhon.agent
      .post(`/api/workspaces/${workspaceId}/conversations/${conv.body.conversation.id}/messages`)
      .send({ content: '¿Qué hago primero?' })
      .expect(201);
    expect(res.body.pixelMessage.content).toContain('Entregar propuesta');
    expect(res.body.pixelMessage.content).toMatch(/No puedo marcar tareas como hechas/);
    // Sin brief, el chat sigue funcionando como antes.
    const other = await registerUser(app, 'Ana');
    const otherWs = await personalPixel(other);
    const c2 = await other.agent.post(`/api/workspaces/${otherWs}/conversations`).expect(201);
    await other.agent
      .post(`/api/workspaces/${otherWs}/conversations/${c2.body.conversation.id}/messages`)
      .send({ content: '¿Qué hago primero?' })
      .expect(201);
  });
});
