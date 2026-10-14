import {
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type PixelCommand,
} from '@pixel/contracts';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { CampaignModel } from '../src/modules/campaigns/campaign.model.js';
import { ContentPlanModel } from '../src/modules/content-plans/contentPlan.model.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { PixelCommandModel } from '../src/modules/pixel-command/pixelCommand.model.js';
import {
  authorizationFor,
  coveredByPlanConfirmation,
} from '../src/modules/actions/authorization.policy.js';
import {
  buildCapabilityCatalog,
  catalogForAI,
  resolveActionDrafts,
} from '../src/modules/actions/capability.catalog.js';
import { defineCapability, type PixelTool } from '../src/modules/actions/action.types.js';
import { PixelToolRegistry } from '../src/modules/actions/toolRegistry.js';
import {
  createDefaultToolRegistry,
  workspaceProjectsTool,
  workspaceTasksTool,
} from '../src/modules/actions/tools/index.js';
import { STALE_EXECUTION_MS } from '../src/modules/pixel-command/pixelCommand.service.js';
import {
  WorkspaceModel,
  type WorkspaceDocument,
} from '../src/modules/workspaces/workspace.model.js';
import {
  createProject as createProjectService,
  findProjectByActionKey,
} from '../src/modules/operations/projects.service.js';
import { createTask as createTaskService } from '../src/modules/operations/tasks.service.js';
import type { ToolExecutionContext } from '../src/modules/actions/action.types.js';
import { CreateProjectSchema, CreateTaskSchema } from '@pixel/contracts';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { creativeDirector } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createProject } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

/*
 * Pixel Action Foundation (Prompt 18): PixelActionPlan → confirmación → snapshot congelado →
 * herramientas → verificación → resultado veraz. Herramientas con fallos simulados SOLO aquí.
 */

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

const commands = (workspaceId: string) => `/api/workspaces/${workspaceId}/pixel/commands`;

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return (await workspaceIdOf(companyId)).toString();
}

async function personal(session: Session) {
  const id = await createPersonalWorkspace(session);
  await completePersonalOnboarding(session, id, creativeDirector);
  return id;
}

async function ask(session: Session, workspaceId: string, request: string, extra: object = {}) {
  const res = await session.agent
    .post(commands(workspaceId))
    .send({ request, tzOffset: 300, ...extra })
    .expect(201);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function adjust(
  session: Session,
  workspaceId: string,
  command: PixelCommand,
  message: string,
) {
  const res = await session.agent
    .post(`${commands(workspaceId)}/${command.id}/adjust`)
    .send({ message })
    .expect(200);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function confirm(session: Session, workspaceId: string, command: PixelCommand) {
  const res = await session.agent
    .post(`${commands(workspaceId)}/${command.id}/confirm`)
    .send({ revision: command.plan!.revision })
    .expect(200);
  return PixelCommandConfirmResponseSchema.parse(res.body);
}

const writes = async () => ({
  projects: await ProjectModel.collection.countDocuments(),
  tasks: await TaskModel.collection.countDocuments(),
  plans: await ContentPlanModel.collection.countDocuments(),
  content: await ContentItemModel.collection.countDocuments(),
  campaigns: await CampaignModel.collection.countDocuments(),
});
const NOTHING = { projects: 0, tasks: 0, plans: 0, content: 0, campaigns: 0 };

/** Registro con la herramienta de tareas alterada (solo para tests). */
function registryWithTasks(
  execute: (input: { title: string }, original: () => Promise<unknown>) => Promise<unknown>,
  projects: PixelTool = workspaceProjectsTool,
) {
  const tasks: PixelTool = {
    ...workspaceTasksTool,
    capabilities: workspaceTasksTool.capabilities.map((capability) =>
      capability.key === 'create_task'
        ? {
            ...capability,
            execute: (input, ctx) =>
              execute(input as { title: string }, () =>
                capability.execute(input, ctx),
              ) as ReturnType<typeof capability.execute>,
          }
        : capability,
    ),
  };
  return new PixelToolRegistry().register(projects).register(tasks);
}

const PERSONAL_REQUEST =
  'Crea un proyecto para preparar mi parcial y agrega tres tareas: repasar límites, practicar derivadas y hacer un simulacro.';
const ENTERPRISE_REQUEST =
  'Crea un proyecto para lanzar el servicio de prototipado y agrega tareas para definir propuesta, preparar material y revisar lanzamiento.';

describe('ActionAuthorizationPolicy (determinista, nunca la IA)', () => {
  it('lectura → none; crear/actualizar significativo/borrar internos → confirm; externo → confirm/elevated; dinero → unsupported', () => {
    expect(authorizationFor({ effect: 'read', target: 'internal' })).toBe('none');
    expect(authorizationFor({ effect: 'read', target: 'external' })).toBe('none');
    expect(authorizationFor({ effect: 'create', target: 'internal' })).toBe('confirm');
    expect(authorizationFor({ effect: 'update', target: 'internal', significant: true })).toBe(
      'confirm',
    );
    expect(authorizationFor({ effect: 'update', target: 'internal' })).toBe('none');
    expect(authorizationFor({ effect: 'delete', target: 'internal' })).toBe('confirm');
    expect(authorizationFor({ effect: 'create', target: 'external' })).toBe('confirm');
    expect(authorizationFor({ effect: 'update', target: 'external' })).toBe('confirm');
    expect(authorizationFor({ effect: 'delete', target: 'external' })).toBe('elevated');
    for (const effect of ['read', 'create', 'update', 'delete'] as const) {
      expect(authorizationFor({ effect, target: 'external', financial: true })).toBe('unsupported');
    }
    // La confirmación del plan cubre none y confirm; nunca elevated ni unsupported.
    expect(
      ['none', 'confirm', 'elevated', 'unsupported'].map((a) =>
        coveredByPlanConfirmation(a as never),
      ),
    ).toEqual([true, true, false, false]);
  });

  it('el registro no admite capacidades financieras ni duplicadas', () => {
    const pay = defineCapability({
      key: 'pay',
      description: 'Pagar',
      inputSchema: z.object({}),
      effect: 'create',
      target: 'external',
      financial: true,
      resourceKind: 'task',
      execute: async () => ({ status: 'success', summary: '', resourceRefs: [] }),
      verify: async () => true,
    });
    const tool: PixelTool = {
      key: 'payments',
      name: 'Pagos',
      description: '',
      contextTypes: ['personal', 'enterprise'],
      capabilities: [pay],
      availability: () => 'available',
    };
    expect(() => new PixelToolRegistry().register(tool)).toThrow(/no admitida/);
    expect(() =>
      new PixelToolRegistry().register(workspaceTasksTool).register(workspaceTasksTool),
    ).toThrow(/duplicada/);
  });

  it('una herramienta externa de prueba (solo en test) exige confirmación y no aparece sin conexión', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await WorkspaceModel.findOne({ _id: await personal(jhon) });
    const fakeExternal: PixelTool = {
      key: 'test.external',
      name: 'Externa de prueba',
      description: '',
      contextTypes: ['personal'],
      capabilities: [
        defineCapability({
          key: 'external.create',
          description: 'Crear algo fuera de Pixel',
          inputSchema: z.object({ title: z.string() }).strict(),
          effect: 'create',
          target: 'external',
          resourceKind: 'task',
          execute: async () => ({ status: 'success', summary: '', resourceRefs: [] }),
          verify: async () => true,
        }),
      ],
      availability: () => 'requires_auth',
    };
    const registry = createDefaultToolRegistry().register(fakeExternal);
    expect(registry.availability('test.external', ws!)).toBe('requires_auth');
    expect(registry.resolve('test.external', 'external.create', ws!)).toBeNull();
    expect(registry.availability('google.calendar', ws!)).toBe('not_registered');
    const connected = createDefaultToolRegistry().register({
      ...fakeExternal,
      availability: () => 'available',
    });
    expect(connected.resolve('test.external', 'external.create', ws!)?.authorization).toBe(
      'confirm',
    );
  });
});

describe('Responder no es actuar', () => {
  it('«¿Qué es una campaña?» → respuesta, 0 acciones, 0 escrituras', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(jhon, tinto, '¿Qué es una campaña?');
    expect(command.status).toBe('answered');
    expect(command.intent).toBe('creative_advice');
    expect(command.plan).toBeNull();
    expect(await writes()).toEqual(NOTHING);
  });

  it('«¿Cuántas tareas pendientes tengo?» → lectura en el acto, sin propuesta ni confirmación', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    await jhon.agent
      .post(`/api/workspaces/${ws}/tasks`)
      .send({ title: 'Revisar notas' })
      .expect(201);
    const command = await ask(jhon, ws, '¿Cuántas tareas pendientes tengo?');
    expect(command.intent).toBe('work_status');
    expect(command.status).toBe('answered');
    expect(command.plan).toBeNull();
    expect(command.reply).toMatch(/1 tarea pendiente/);
    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(doc?.authorization).toBeNull();
    expect(doc?.actionResults).toEqual([]);
  });
});

describe('Proponer → autorizar → congelar → ejecutar → verificar', () => {
  it('«Crea un proyecto llamado Preparar parcial.»: nada antes de Organizar; después, 1 proyecto verificado', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, 'Crea un proyecto llamado Preparar parcial.');
    expect(command.status).toBe('proposed');
    expect(command.plan?.actions.map((a) => [a.title, a.status])).toEqual([
      ['Crear el proyecto «Preparar parcial»', 'pending'],
    ]);
    expect(await writes()).toEqual(NOTHING);
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('completed');
    expect(done.reply).toBe('Listo. Creé el proyecto «Preparar parcial».');
    const project = await ProjectModel.findOne({ workspaceId: ws });
    expect(project?.name).toBe('Preparar parcial');
    expect(done.plan?.actions[0]).toMatchObject({
      status: 'success',
      resource: { kind: 'project', id: project!._id.toString() },
    });
  });

  it('Personal (prueba crítica): una confirmación, snapshot congelado con quién y cuándo, 1 proyecto + 3 tareas verificadas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    expect(command.intent).toBe('organize_project');
    expect(command.status).toBe('proposed');
    expect(command.plan?.actions.map((a) => a.title)).toEqual([
      'Crear el proyecto «preparar mi parcial»',
      'Crear la tarea «Repasar límites»',
      'Crear la tarea «Practicar derivadas»',
      'Crear la tarea «Hacer un simulacro»',
    ]);
    // La vista humana nunca lleva claves de herramientas, capacidades ni entradas internas.
    expect(JSON.stringify(command)).not.toMatch(
      /workspace\.(?:tasks|projects)|toolKey|capabilityKey|inputRefs/,
    );
    expect(await writes()).toEqual(NOTHING);

    const { command: done, executed } = await confirm(jhon, ws, command);
    expect(executed).toBe(true);
    expect(done.status).toBe('completed');
    expect(done.reply).toBe(
      'Listo. Creé el proyecto «preparar mi parcial» y sus 3 tareas: «Repasar límites», «Practicar derivadas» y «Hacer un simulacro».',
    );
    const project = await ProjectModel.findOne({ workspaceId: ws });
    const tasks = await TaskModel.find({ workspaceId: ws }).sort({ createdAt: 1 });
    expect(tasks.map((t) => t.title)).toEqual([
      'Repasar límites',
      'Practicar derivadas',
      'Hacer un simulacro',
    ]);
    expect(tasks.every((t) => t.projectId?.toString() === project!._id.toString())).toBe(true);
    expect(done.plan?.actions.every((a) => a.status === 'success' && a.resource)).toBe(true);

    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(doc?.authorization?.revision).toBe(command.plan!.revision);
    expect(doc?.authorization?.authorizedBy).toBe(jhon.user.id);
    expect(doc?.authorization?.authorizedAt).toBeInstanceOf(Date);
    expect(doc?.authorization?.actions.map((a) => [a.toolKey, a.capabilityKey])).toEqual([
      ['workspace.projects', 'create_project'],
      ['workspace.tasks', 'create_task'],
      ['workspace.tasks', 'create_task'],
      ['workspace.tasks', 'create_task'],
    ]);
    // La tarea depende del proyecto por referencia controlada, no por un id interpolado.
    expect(doc?.authorization?.actions[1]).toMatchObject({
      dependsOnActionId: 'step_1.project',
      inputRefs: [{ field: 'projectId', fromAction: 'step_1.project', kind: 'project' }],
    });
    expect(doc?.actionResults.map((r) => [r.status, r.verified])).toEqual([
      ['success', true],
      ['success', true],
      ['success', true],
      ['success', true],
    ]);
    // Sin secretos ni el tenant en la entrada congelada: solo campos de la capacidad.
    const inputs = JSON.stringify(doc?.authorization?.actions.map((a) => a.input));
    expect(inputs).not.toMatch(/workspaceId|token|password|secret|apiKey/i);
  });

  it('Enterprise (prueba crítica): el mismo motor en INVENTIA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const command = await ask(jhon, lab, ENTERPRISE_REQUEST);
    expect(command.intent).toBe('organize_project');
    expect(command.plan?.actions).toHaveLength(4);
    const { command: done } = await confirm(jhon, lab, command);
    expect(done.status).toBe('completed');
    expect(await ProjectModel.countDocuments({ workspaceId: lab })).toBe(1);
    expect((await TaskModel.find({ workspaceId: lab })).map((t) => t.title).sort()).toEqual([
      'Definir propuesta',
      'Preparar material',
      'Revisar lanzamiento',
    ]);
  });

  it('«Crea un proyecto…» crea uno NUEVO aunque otro comparta palabras (encontrado en el smoke)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    await createProject(jhon, ws, { name: 'preparar mi parcial' });
    const command = await ask(
      jhon,
      ws,
      'Crea un proyecto para preparar el final y agrega tres tareas: leer apuntes, resolver ejercicios y repasar fórmulas.',
    );
    expect(command.plan?.actions[0]?.title).toBe('Crear el proyecto «preparar el final»');
    await confirm(jhon, ws, command);
    expect((await ProjectModel.find({ workspaceId: ws })).map((p) => p.name).sort()).toEqual([
      'preparar el final',
      'preparar mi parcial',
    ]);
    // Con el MISMO nombre, se reutiliza el existente (no se duplica).
    const same = await ask(
      jhon,
      ws,
      'Crea un proyecto llamado preparar el final y agrega tareas para revisar todo.',
    );
    expect(same.plan?.actions.map((a) => a.kind)).toEqual(['task']);
  });

  it('«…y agrega tres tareas.» sin nombrarlas: UNA pregunta, nunca tareas inventadas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(
      jhon,
      ws,
      'Crea un proyecto llamado Lanzamiento y agrega tres tareas.',
    );
    expect(command.status).toBe('needs_information');
    expect(command.question).toMatch(/¿Qué tareas agrego a «Lanzamiento»\?/);
    const answered = await adjust(
      jhon,
      ws,
      command,
      'Definir propuesta, preparar piezas y revisar lanzamiento',
    );
    expect(answered.status).toBe('proposed');
    expect(answered.plan?.actions).toHaveLength(4);
    expect(await writes()).toEqual(NOTHING);
  });

  it('Ajustar «Quita la segunda»: nueva revisión con 2 tareas; solo se crean esas 2', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const adjusted = await adjust(jhon, ws, command, 'Quita la segunda.');
    expect(adjusted.plan!.revision).toBe(command.plan!.revision + 1);
    expect(adjusted.plan?.actions.map((a) => a.label)).toEqual([
      'preparar mi parcial',
      'Repasar límites',
      'Hacer un simulacro',
    ]);
    // La revisión anterior ya no se puede confirmar.
    await jhon.agent
      .post(`${commands(ws)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(409);
    await confirm(jhon, ws, adjusted);
    expect((await TaskModel.find({ workspaceId: ws })).map((t) => t.title).sort()).toEqual([
      'Hacer un simulacro',
      'Repasar límites',
    ]);
  });

  it('dos confirmaciones simultáneas: 1 ejecución efectiva, 1 proyecto, 3 tareas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const send = () =>
      jhon.agent
        .post(`${commands(ws)}/${command.id}/confirm`)
        .send({ revision: command.plan!.revision });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.executed, b.body.executed].sort()).toEqual([false, true]);
    expect(await ProjectModel.countDocuments({ workspaceId: ws })).toBe(1);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(3);
  });

  it('contexto del Pixel Dock: dentro del proyecto X, «Crea una tarea para revisar esto.» usa X (revalidado)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const project = await createProject(jhon, ws, { name: 'Lanzamiento' });
    const command = await ask(jhon, ws, 'Crea una tarea para revisar esto.', {
      contextHint: { resource: { type: 'project', id: project.id } },
    });
    expect(command.status).toBe('proposed');
    expect(command.plan?.summary).toMatch(/en el proyecto «Lanzamiento»/);
    await confirm(jhon, ws, command);
    const task = await TaskModel.findOne({ workspaceId: ws });
    expect(task?.title).toBe('Revisar esto');
    expect(task?.projectId?.toString()).toBe(project.id);
  });

  it('contexto ambiguo: «Organiza el proyecto» con varios proyectos → una pregunta, sin inventar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    await createProject(jhon, ws, { name: 'Tesis' });
    await createProject(jhon, ws, { name: 'Portafolio' });
    const command = await ask(jhon, ws, 'Organiza el proyecto');
    expect(command.status).toBe('needs_information');
    expect(command.question).toMatch(/¿Qué proyecto quieres organizar\?/);
    expect(await ProjectModel.countDocuments({ workspaceId: ws })).toBe(2);
  });
});

describe('Fallos: dependencias, parciales, verificación y entrada inválida', () => {
  it('si el proyecto falla, sus tareas se omiten (dependency_failed) y no se crea nada', async () => {
    const failingProjects: PixelTool = {
      ...workspaceProjectsTool,
      capabilities: workspaceProjectsTool.capabilities.map((capability) => ({
        ...capability,
        execute: async () => {
          throw new Error('caída simulada');
        },
      })),
    };
    const faulty = buildTestApp(
      new DemoProvider(),
      registryWithTasks((_, run) => run(), failingProjects),
    );
    const jhon = await registerUser(faulty, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('failed');
    expect(done.plan?.actions.map((a) => a.status)).toEqual([
      'failed',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(done.reply).toBe(
      'No pude crear el proyecto «preparar mi parcial», así que no creé sus 3 tareas. No se creó nada.',
    );
    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(doc?.actionResults.map((r) => r.errorCode)).toEqual([
      'execution_failed',
      'dependency_failed',
      'dependency_failed',
      'dependency_failed',
    ]);
    expect(await writes()).toEqual(NOTHING);
  });

  it('fallo parcial (prueba crítica): ✓ proyecto ✓ A ✕ B ✓ C → partial con el resultado exacto; reintentar no duplica', async () => {
    let fail = true;
    const faulty = buildTestApp(
      new DemoProvider(),
      registryWithTasks(async (input, run) => {
        if (fail && input.title === 'Practicar derivadas') throw new Error('caída simulada');
        return run();
      }),
    );
    const jhon = await registerUser(faulty, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('partial');
    expect(done.plan?.actions.map((a) => a.status)).toEqual([
      'success',
      'success',
      'failed',
      'success',
    ]);
    expect(done.reply).toBe(
      'Creé el proyecto «preparar mi parcial» y 2 de las 3 tareas. No pude crear «Practicar derivadas». Puedes reintentarlo: lo que ya está creado no se duplica.',
    );
    expect(done.reply).not.toMatch(/Listo/);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(2);

    // Reintentar con el mismo snapshot: solo lo que falló.
    fail = false;
    const before = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    const retry = await jhon.agent
      .post(`${commands(ws)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    expect(retry.body.command.status).toBe('completed');
    expect(await ProjectModel.countDocuments({ workspaceId: ws })).toBe(1);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(3);
    const after = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    // El snapshot autorizado no cambió.
    expect(after?.authorization?.authorizedAt.getTime()).toBe(
      before?.authorization?.authorizedAt.getTime(),
    );
    expect(JSON.stringify(after?.authorization?.actions)).toBe(
      JSON.stringify(before?.authorization?.actions),
    );
  });

  it('la herramienta dice «hecho» pero el verificador no lo encuentra → verification_failed, nunca «Creé»', async () => {
    const faulty = buildTestApp(
      new DemoProvider(),
      registryWithTasks(async (input, run) =>
        input.title === 'Hacer un simulacro'
          ? {
              status: 'success',
              summary: 'Hecho (falso)',
              resourceRefs: [{ kind: 'task', id: '64b7f0c2a1b2c3d4e5f60099', label: input.title }],
            }
          : run(),
      ),
    );
    const jhon = await registerUser(faulty, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('partial');
    expect(done.plan?.actions[3]).toMatchObject({
      status: 'failed',
      resource: null,
      error: 'No pude confirmar que se completara',
    });
    expect(done.reply).toMatch(/No pude confirmar que «Hacer un simulacro» se creara/);
    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(doc?.actionResults[3]).toMatchObject({
      errorCode: 'verification_failed',
      verified: false,
    });
  });

  it('entrada inválida (título vacío): 409 action_invalid_input, nada se ejecuta y la propuesta sigue', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await PixelCommandModel.create({
      workspaceId: tinto,
      status: 'proposed',
      intent: 'organize_project',
      request: 'Organiza el proyecto Empaque',
      interpretation: { mode: 'rules', confidence: 0.75 },
      plan: { summary: 'Creo el proyecto', understood: [], proposal: [], creates: [], revision: 1 },
      steps: [
        {
          id: 'step_1',
          type: 'create_project',
          title: 'Crear el proyecto «Empaque»',
          params: { name: 'Empaque' },
        },
        {
          id: 'step_2',
          type: 'create_tasks',
          title: 'Crear 1 tarea',
          params: { tasks: [{ title: '' }], projectFromStep: 'step_1' },
        },
      ],
    });
    const res = await jhon.agent
      .post(`${commands(tinto)}/${command._id.toString()}/confirm`)
      .send({ revision: 1 })
      .expect(409);
    expect(res.body.error.details.reason).toBe('action_invalid_input');
    expect(await writes()).toEqual(NOTHING);
    const doc = await PixelCommandModel.findOne({ _id: command._id, workspaceId: tinto });
    expect(doc?.status).toBe('proposed');
    expect(doc?.authorization).toBeNull();
  });
});

describe('Catálogo para la IA: referencias controladas', () => {
  it('solo capacidades disponibles y relevantes; CAPABILITY_999, «send_whatsapp» o datos incompletos se rechazan', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await WorkspaceModel.findOne({ _id: await personal(jhon) });
    const registry = createDefaultToolRegistry();
    const catalog = buildCapabilityCatalog(registry, ws!, { effects: ['create'] });
    expect(catalogForAI(catalog)).toEqual([
      {
        ref: 'CAPABILITY_1',
        description: 'Crear un proyecto en este Pixel.',
        requiresConfirmation: true,
      },
      {
        ref: 'CAPABILITY_2',
        description: 'Crear una tarea en este Pixel (opcionalmente dentro de un proyecto).',
        requiresConfirmation: true,
      },
    ]);
    // Nada de claves internas para la IA.
    expect(JSON.stringify(catalogForAI(catalog))).not.toMatch(/workspace\.|create_/);

    const resources = new Map();
    const ok = resolveActionDrafts(
      {
        responseMode: 'proposal',
        actions: [
          { capabilityRef: 'CAPABILITY_1', title: 'Proyecto Parcial', input: { name: 'Parcial' } },
          {
            capabilityRef: 'CAPABILITY_2',
            title: 'Repasar',
            input: { title: 'Repasar' },
            dependsOn: 1,
          },
        ],
      },
      catalog,
      registry,
      ws!,
      resources,
    );
    expect(ok.rejected).toEqual([]);
    expect(ok.actions[1]).toMatchObject({
      capabilityKey: 'create_task',
      dependsOnActionId: 'ai_1',
      inputRefs: [{ field: 'projectId', fromAction: 'ai_1', kind: 'project' }],
    });

    for (const capabilityRef of ['CAPABILITY_999', 'send_whatsapp']) {
      const bad = resolveActionDrafts(
        { responseMode: 'proposal', actions: [{ capabilityRef, title: 'X', input: {} }] },
        catalog,
        registry,
        ws!,
        resources,
      );
      expect(bad.actions).toEqual([]);
      expect(bad.rejected[0]).toMatch(/Capacidad desconocida/);
    }
    const missingTitle = resolveActionDrafts(
      {
        responseMode: 'proposal',
        actions: [{ capabilityRef: 'CAPABILITY_2', title: 'Tarea', input: {} }],
      },
      catalog,
      registry,
      ws!,
      resources,
    );
    expect(missingTitle.actions).toEqual([]);
    expect(missingTitle.rejected[0]).toMatch(/Datos incompletos/);
    // Un recurso que no está en el contexto (otro Pixel) se rechaza.
    const foreign = resolveActionDrafts(
      {
        responseMode: 'proposal',
        actions: [
          {
            capabilityRef: 'CAPABILITY_2',
            title: 'T',
            input: { title: 'T', projectId: 'PROJECT_7' },
          },
        ],
      },
      catalog,
      registry,
      ws!,
      resources,
    );
    expect(foreign.rejected[0]).toMatch(/fuera de contexto/);
    expect(
      resolveActionDrafts({ responseMode: 'answer' }, catalog, registry, ws!, resources),
    ).toEqual({
      actions: [],
      rejected: [],
    });
  });
});

describe('Límites honestos: lo que Pixel no puede hacer', () => {
  it('Google Calendar (prueba crítica): no es un plan de contenido, no crea nada y no finge éxito', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, 'Pon mañana a las 3 una reunión en mi Google Calendar.');
    expect(command.intent).toBe('external_action');
    expect(command.status).toBe('answered');
    expect(command.plan).toBeNull();
    expect(command.reply).toMatch(/todavía no tengo acceso a tu Google Calendar/);
    expect(command.reply).not.toMatch(/Listo|creé|agendé/i);
    expect(await writes()).toEqual(NOTHING);
    await jhon.agent
      .post(`${commands(ws)}/${command.id}/confirm`)
      .send({ revision: 1 })
      .expect(409);
    // «Calendario de contenido» sigue siendo planear contenido.
    const content = await ask(
      jhon,
      ws,
      'Arma el calendario de contenido de esta semana para Instagram',
    );
    expect(content.intent).toBe('plan_content');
  });

  it('correo y mensajes: no se envía nada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    for (const request of ['Envíale un correo a Laura.', 'Envía este correo a Laura.']) {
      const command = await ask(jhon, tinto, request);
      expect(command.intent).toBe('external_action');
      expect(command.reply).toMatch(/todavía no tengo acceso a tu correo/);
      expect(command.reply).not.toMatch(/enviado|envié/i);
    }
    expect(await writes()).toEqual(NOTHING);
  });

  it('compras, pagos y transferencias: nunca (unsupported)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    for (const request of ['Compra esto.', 'Paga esto.', 'Transfiere 100 dólares a Juan.']) {
      const command = await ask(jhon, ws, request);
      expect(command.intent).toBe('external_action');
      expect(command.plan).toBeNull();
      expect(command.reply).toMatch(/No hago compras, pagos ni transferencias/);
    }
    expect(
      await PixelCommandModel.countDocuments({ workspaceId: ws, authorization: { $ne: null } }),
    ).toBe(0);
  });
});

describe('Seguridad', () => {
  it('manipulación: el cliente no puede enviar quién autoriza, el tenant ni la acción', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    for (const extra of [
      { authorizedBy: '64b7f0c2a1b2c3d4e5f60001' },
      { workspaceId: '64b7f0c2a1b2c3d4e5f60002' },
      { toolKey: 'workspace.tasks', capabilityKey: 'update_task' },
      { actions: [{ input: { title: 'Otra cosa' } }] },
    ]) {
      await jhon.agent
        .post(`${commands(ws)}/${command.id}/confirm`)
        .send({ revision: command.plan!.revision, ...extra })
        .expect(400);
    }
    expect(await writes()).toEqual(NOTHING);
    // Tras autorizar, el plan no se ajusta: un cambio exige una propuesta nueva.
    await confirm(jhon, ws, command);
    await jhon.agent
      .post(`${commands(ws)}/${command.id}/adjust`)
      .send({ message: 'Quita la segunda' })
      .expect(409);
  });

  it('mismo dueño: una propuesta de TINTO nunca toca un proyecto de INVENTIA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const labProject = await createProject(jhon, lab, { name: 'Prototipado' });
    // El Dock de TINTO no resuelve un proyecto de INVENTIA.
    await jhon.agent
      .post(commands(tinto))
      .send({
        request: 'Crea una tarea para revisar esto.',
        contextHint: { resource: { type: 'project', id: labProject.id } },
      })
      .expect(400);
    // Aunque un plan llevara ese id, la herramienta usa el workspace autorizado y el servicio lo rechaza.
    const crafted = await PixelCommandModel.create({
      workspaceId: tinto,
      status: 'proposed',
      intent: 'create_tasks',
      request: 'Tarea',
      interpretation: { mode: 'rules', confidence: 0.75 },
      plan: { summary: 'Apunto una tarea', understood: [], proposal: [], creates: [], revision: 1 },
      steps: [
        {
          id: 'step_1',
          type: 'create_tasks',
          title: 'Crear 1 tarea',
          params: { tasks: [{ title: 'Revisar', projectId: labProject.id }] },
        },
      ],
    });
    const res = await jhon.agent
      .post(`${commands(tinto)}/${crafted._id.toString()}/confirm`)
      .send({ revision: 1 })
      .expect(200);
    expect(res.body.command.status).toBe('failed');
    expect(await TaskModel.collection.countDocuments()).toBe(0);
    const doc = await PixelCommandModel.findOne({ _id: crafted._id, workspaceId: tinto });
    // tasks.service responde 400 en projectId («Proyecto no encontrado») sin revelar que existe.
    expect(doc?.actionResults[0]?.errorCode).toBe('invalid_input');
  });
});

describe('Recuperación de una ejecución abandonada', () => {
  it('«executing» sin actividad se libera al consultar; reintentar completa sin duplicar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    // El proceso «se cayó» al reservar: executing, sin actividad desde hace más del umbral.
    const old = new Date(Date.now() - STALE_EXECUTION_MS - 60_000);
    await PixelCommandModel.updateOne(
      { _id: command.id, workspaceId: ws },
      {
        $set: {
          status: 'executing',
          executionId: '64b7f0c2a1b2c3d4e5f600aa',
          executionStartedAt: old,
          executionUpdatedAt: old,
        },
      },
    );
    // Reciente: no se toca (executed: false).
    const fresh = await ask(jhon, ws, 'Crea un proyecto llamado Reciente.');
    await PixelCommandModel.updateOne(
      { _id: fresh.id, workspaceId: ws },
      {
        $set: {
          status: 'executing',
          executionId: '64b7f0c2a1b2c3d4e5f600bb',
          executionStartedAt: new Date(),
          executionUpdatedAt: new Date(),
        },
      },
    );
    const busy = await jhon.agent
      .post(`${commands(ws)}/${fresh.id}/confirm`)
      .send({ revision: fresh.plan!.revision })
      .expect(200);
    expect(busy.body.executed).toBe(false);

    const read = await jhon.agent.get(`${commands(ws)}/${command.id}`).expect(200);
    expect(read.body.command.status).toBe('failed');
    expect(read.body.command.reply).toMatch(/se interrumpió/);
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('completed');
    expect(
      await ProjectModel.countDocuments({ workspaceId: ws, name: 'preparar mi parcial' }),
    ).toBe(1);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(3);
  });

  it('lo que ya estaba hecho no se repite al recuperar', async () => {
    let fail = true;
    const faulty = buildTestApp(
      new DemoProvider(),
      registryWithTasks(async (input, run) => {
        if (fail && input.title !== 'Repasar límites') throw new Error('caída simulada');
        return run();
      }),
    );
    const jhon = await registerUser(faulty, 'Jhon');
    const ws = await personal(jhon);
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    await confirm(jhon, ws, command);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(1);
    // Queda «executing» abandonado tras ese intento.
    const old = new Date(Date.now() - STALE_EXECUTION_MS - 60_000);
    await PixelCommandModel.updateOne(
      { _id: command.id, workspaceId: ws },
      {
        $set: {
          status: 'executing',
          executionId: '64b7f0c2a1b2c3d4e5f600cc',
          executionUpdatedAt: old,
        },
      },
    );
    fail = false;
    const retry = await jhon.agent
      .post(`${commands(ws)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    expect(retry.body.executed).toBe(true);
    expect(retry.body.command.status).toBe('completed');
    expect(await ProjectModel.countDocuments({ workspaceId: ws })).toBe(1);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(3);
  });
});

describe('Regresión: los pasos anteriores siguen igual, ahora con quién autorizó', () => {
  it('una campaña se organiza como siempre y queda registrado quién y cuándo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(
      jhon,
      tinto,
      'Necesito lanzar el nuevo TINTO 500 g la próxima semana en Instagram',
    );
    const { command: done } = await confirm(jhon, tinto, command);
    expect(done.status).toBe('completed');
    expect(done.plan?.actions).toEqual([]);
    expect(await CampaignModel.countDocuments({ workspaceId: tinto })).toBe(1);
    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: tinto });
    expect(doc?.authorization).toMatchObject({
      revision: command.plan!.revision,
      authorizedBy: jhon.user.id,
      actions: [],
    });
  });
});

describe('Idempotencia de creación: la clave de la acción, nunca el texto', () => {
  const OLD = () => new Date(Date.now() - STALE_EXECUTION_MS - 60_000);
  const stale = (commandId: string, workspaceId: string, executionId: string) =>
    PixelCommandModel.updateOne(
      { _id: commandId, workspaceId },
      {
        $set: {
          status: 'executing',
          executionId,
          executionStartedAt: OLD(),
          executionUpdatedAt: OLD(),
        },
      },
    );
  const ctxFor = (workspace: WorkspaceDocument, idempotencyKey: string): ToolExecutionContext => ({
    workspace,
    contextType: workspace.type,
    actorUserId: '64b7f0c2a1b2c3d4e5f60001',
    commandId: '64b7f0c2a1b2c3d4e5f60002',
    executionId: '64b7f0c2a1b2c3d4e5f60003',
    idempotencyKey,
  });
  const [createProjectCap] = workspaceProjectsTool.capabilities;
  const [createTaskCap] = workspaceTasksTool.capabilities;

  it('caída tras crear el proyecto (y una tarea) sin guardar su resultado: al recuperar, exactamente 1 proyecto y 3 tareas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const command = await ask(jhon, ws, PERSONAL_REQUEST);
    const key = (actionId: string) => `${command.id}:${command.plan!.revision}:${actionId}`;
    // Lo que la herramienta alcanzó a crear antes de que el proceso cayera (sin ActionResult).
    const project = await createProjectService(
      workspace,
      CreateProjectSchema.parse({ name: 'preparar mi parcial' }),
      { actionKey: key('step_1.project') },
    );
    await createTaskService(
      workspace,
      CreateTaskSchema.parse({ title: 'Repasar límites', status: 'todo', projectId: project.id }),
      { source: 'pixel', actionKey: key('step_2.task_1') },
    );
    await stale(command.id, ws, '64b7f0c2a1b2c3d4e5f600dd');
    const doc = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(doc?.actionResults).toEqual([]);

    const read = await jhon.agent.get(`${commands(ws)}/${command.id}`).expect(200);
    expect(read.body.command.status).toBe('failed');
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('completed');
    expect(await ProjectModel.countDocuments({ workspaceId: ws })).toBe(1);
    const tasks = await TaskModel.find({ workspaceId: ws });
    expect(tasks.map((t) => t.title).sort()).toEqual([
      'Hacer un simulacro',
      'Practicar derivadas',
      'Repasar límites',
    ]);
    expect(tasks.every((t) => t.projectId?.toString() === project.id)).toBe(true);
    // El resultado se reconstruyó sobre lo que ya existía, verificado.
    const after = await PixelCommandModel.findOne({ _id: command.id, workspaceId: ws });
    expect(after?.actionResults[0]).toMatchObject({
      status: 'success',
      verified: true,
      resourceRefs: [{ kind: 'project', id: project.id }],
    });
    expect(after?.actionResults[0]?.summary).toMatch(/ya lo había creado esta acción/);
    expect(after?.actionResults[1]?.summary).toMatch(/ya la había creado esta acción/);
    // La clave es técnica: no sale en la API.
    expect(JSON.stringify(done)).not.toMatch(/pixelActionKey/);
    const listed = await jhon.agent.get(`/api/workspaces/${ws}/tasks`).expect(200);
    expect(JSON.stringify(listed.body)).not.toMatch(/pixelActionKey/);
  });

  it('caída tras crear una tarea en un proyecto existente: exactamente 1 tarea al recuperar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const project = await createProject(jhon, ws, { name: 'Lanzamiento' });
    const command = await ask(jhon, ws, 'Crea una tarea para revisar esto.', {
      contextHint: { resource: { type: 'project', id: project.id } },
    });
    await createTaskService(
      workspace,
      CreateTaskSchema.parse({ title: 'Revisar esto', status: 'todo', projectId: project.id }),
      { source: 'pixel', actionKey: `${command.id}:${command.plan!.revision}:step_1.task_1` },
    );
    await stale(command.id, ws, '64b7f0c2a1b2c3d4e5f600ee');
    const { command: done } = await confirm(jhon, ws, command);
    expect(done.status).toBe('completed');
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(1);
  });

  it('dos creaciones simultáneas de la MISMA acción (misma clave): 1 proyecto y 1 tarea', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspace = (await WorkspaceModel.findOne({ _id: await personal(jhon) }))!;
    const ctx = ctxFor(workspace, 'cmd:1:step_1.project');
    const input = CreateProjectSchema.parse({ name: 'Carrera' });
    const [a, b] = await Promise.all([
      createProjectCap!.execute(input, ctx),
      createProjectCap!.execute(input, ctx),
    ]);
    expect(a.resourceRefs[0]?.id).toBe(b.resourceRefs[0]?.id);
    expect(await ProjectModel.countDocuments({ workspaceId: workspace._id })).toBe(1);
    // También directamente en el servicio (el índice único parcial decide la carrera).
    const [s1, s2] = await Promise.all([
      createProjectService(workspace, input, { actionKey: 'cmd:1:otra' }),
      createProjectService(workspace, input, { actionKey: 'cmd:1:otra' }),
    ]);
    expect(s1.id).toBe(s2.id);

    const taskCtx = ctxFor(workspace, 'cmd:1:step_2.task_1');
    const taskInput = CreateTaskSchema.parse({ title: 'Una sola vez' });
    const [t1, t2] = await Promise.all([
      createTaskCap!.execute(taskInput, taskCtx),
      createTaskCap!.execute(taskInput, taskCtx),
    ]);
    expect(t1.resourceRefs[0]?.id).toBe(t2.resourceRefs[0]?.id);
    expect(await TaskModel.countDocuments({ workspaceId: workspace._id })).toBe(1);
  });

  it('acciones DISTINTAS con el mismo nombre o título crean recursos distintos; lo manual no usa clave', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const input = CreateProjectSchema.parse({ name: 'Lanzamiento' });
    await createProjectCap!.execute(input, ctxFor(workspace, 'cmd:1:step_1.project'));
    await createProjectCap!.execute(input, ctxFor(workspace, 'cmd:2:step_1.project'));
    expect(await ProjectModel.countDocuments({ workspaceId: ws, name: 'Lanzamiento' })).toBe(2);
    const task = CreateTaskSchema.parse({ title: 'Revisar' });
    await createTaskCap!.execute(task, ctxFor(workspace, 'cmd:1:step_2.task_1'));
    await createTaskCap!.execute(task, ctxFor(workspace, 'cmd:1:step_2.task_2'));
    expect(await TaskModel.countDocuments({ workspaceId: ws, title: 'Revisar' })).toBe(2);
    // Creación manual (sin clave) sigue igual: dos iguales, sin chocar con el índice parcial.
    await createProject(jhon, ws, { name: 'Manual' });
    await createProject(jhon, ws, { name: 'Manual' });
    await jhon.agent.post(`/api/workspaces/${ws}/tasks`).send({ title: 'A mano' }).expect(201);
    await jhon.agent.post(`/api/workspaces/${ws}/tasks`).send({ title: 'A mano' }).expect(201);
    expect(await ProjectModel.countDocuments({ workspaceId: ws, name: 'Manual' })).toBe(2);
    expect(await TaskModel.countDocuments({ workspaceId: ws, title: 'A mano' })).toBe(2);
    const manual = await ProjectModel.findOne({ workspaceId: ws, name: 'Manual' });
    expect(manual?.pixelActionKey).toBeUndefined();
  });

  it('mismo dueño: la clave de una acción de TINTO no recupera ni toca un recurso de INVENTIA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await WorkspaceModel.findOne({
      _id: await brand(jhon, 'Café Tinto', cafeTinto),
    }))!;
    const lab = (await WorkspaceModel.findOne({ _id: await brand(jhon, 'INVENTIA', inventia) }))!;
    const key = 'cmd:1:step_1.project';
    const original = await createProjectService(
      tinto,
      CreateProjectSchema.parse({ name: 'Empaque' }),
      { actionKey: key },
    );
    expect(await findProjectByActionKey(lab, key)).toBeNull();
    const fromLab = await createProjectCap!.execute(
      CreateProjectSchema.parse({ name: 'Prototipado' }),
      ctxFor(lab, key),
    );
    expect(fromLab.resourceRefs[0]?.id).not.toBe(original.id);
    expect(fromLab.summary).toMatch(/^Se creó/);
    const untouched = await ProjectModel.findOne({ _id: original.id, workspaceId: tinto._id });
    expect(untouched?.name).toBe('Empaque');
    expect(await ProjectModel.countDocuments({ workspaceId: lab._id })).toBe(1);
  });

  it('update_task: repetir la misma acción deja el mismo estado final', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personal(jhon);
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const task = (
      await jhon.agent.post(`/api/workspaces/${ws}/tasks`).send({ title: 'Cerrar' }).expect(201)
    ).body.task;
    const update = workspaceTasksTool.capabilities.find((c) => c.key === 'update_task')!;
    const input = { taskId: task.id, changes: { status: 'done', priority: 'high' } };
    const ctx = ctxFor(workspace, 'cmd:1:step_1.update');
    for (let i = 0; i < 2; i += 1) {
      const result = await update.execute(input, ctx);
      expect(await update.verify(result, input, ctx)).toBe(true);
    }
    const saved = await TaskModel.findOne({ _id: task.id, workspaceId: ws });
    expect([saved?.status, saved?.priority]).toEqual(['done', 'high']);
    expect(await TaskModel.countDocuments({ workspaceId: ws })).toBe(1);
  });
});
