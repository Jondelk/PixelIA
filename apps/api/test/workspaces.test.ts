import {
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  type WorkspaceOverview,
} from '@pixel/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

async function create(session: Session, body: object): Promise<WorkspaceOverview> {
  const res = await session.agent.post('/api/workspaces').send(body).expect(201);
  return WorkspaceResponseSchema.parse(res.body);
}

describe('Workspaces: creación y listado', () => {
  let jhon: Session;
  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon Trochez');
  });

  it('crea un Workspace Enterprise vacío (sin empresa todavía)', async () => {
    const { workspace, company } = await create(jhon, { type: 'enterprise', name: 'TINTO' });
    expect(workspace).toMatchObject({
      type: 'enterprise',
      name: 'TINTO',
      slug: 'tinto',
      status: 'active',
      ownerId: jhon.user.id,
    });
    expect(company).toBeNull();
  });

  it('crea un Workspace Personal', async () => {
    const { workspace, company } = await create(jhon, { type: 'personal', name: 'Jhon Trochez' });
    expect(workspace).toMatchObject({
      type: 'personal',
      name: 'Jhon Trochez',
      slug: 'jhon-trochez',
    });
    expect(company).toBeNull();
  });

  it('un usuario tiene varios Pixels a la vez: Personal + varias empresas', async () => {
    await create(jhon, { type: 'personal', name: 'Jhon Trochez' });
    await jhon.agent.post('/api/companies').send({ name: 'TINTO', industry: 'Café' }).expect(201);
    await jhon.agent
      .post('/api/companies')
      .send({ name: 'INVENTIA', industry: 'Tecnología' })
      .expect(201);

    const res = await jhon.agent.get('/api/workspaces').expect(200);
    const { workspaces } = WorkspaceListResponseSchema.parse(res.body);
    expect(
      workspaces.map(({ workspace, company }) => [workspace.name, workspace.type, company?.name]),
    ).toEqual([
      ['INVENTIA', 'enterprise', 'INVENTIA'],
      ['TINTO', 'enterprise', 'TINTO'],
      ['Jhon Trochez', 'personal', undefined],
    ]);
    // Cada empresa en su propio workspace.
    const ids = workspaces.map(({ workspace }) => workspace.id);
    expect(new Set(ids).size).toBe(3);
    for (const { workspace, company } of workspaces) {
      if (company) expect(company.workspaceId).toBe(workspace.id);
    }
  });

  it('solo un Pixel Personal por usuario', async () => {
    await create(jhon, { type: 'personal', name: 'Jhon Trochez' });
    const again = await jhon.agent
      .post('/api/workspaces')
      .send({ type: 'personal', name: 'Otro yo' })
      .expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    // Otro usuario sí puede tener el suyo.
    const ana = await registerUser(app, 'Ana');
    await create(ana, { type: 'personal', name: 'Ana' });
  });

  it('slugs únicos por dueño', async () => {
    const a = await create(jhon, { type: 'enterprise', name: 'Tinto' });
    const b = await create(jhon, { type: 'enterprise', name: 'Tinto' });
    expect([a.workspace.slug, b.workspace.slug]).toEqual(['tinto', 'tinto-2']);
  });

  it('valida la entrada e ignora un ownerId enviado en el cuerpo', async () => {
    await jhon.agent.post('/api/workspaces').send({ type: 'team', name: 'X Y' }).expect(400);
    await jhon.agent.post('/api/workspaces').send({ type: 'personal', name: 'J' }).expect(400);
    const intruder = new mongoose.Types.ObjectId().toString();
    const { workspace } = await create(jhon, {
      type: 'enterprise',
      name: 'TINTO',
      ownerId: intruder,
    });
    expect(workspace.ownerId).toBe(jhon.user.id);
  });

  it('exige sesión', async () => {
    await request(app).get('/api/workspaces').expect(401);
    await request(app).post('/api/workspaces').send({ type: 'personal', name: 'X Y' }).expect(401);
  });
});

describe('Workspaces: lectura y edición', () => {
  it('lee y renombra/archiva su workspace; el tipo no se puede cambiar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspace } = await create(jhon, { type: 'personal', name: 'Jhon Trochez' });

    const read = await jhon.agent.get(`/api/workspaces/${workspace.id}`).expect(200);
    expect(WorkspaceResponseSchema.parse(read.body).workspace.id).toBe(workspace.id);

    const renamed = await jhon.agent
      .patch(`/api/workspaces/${workspace.id}`)
      .send({ name: 'Jhon', status: 'archived' })
      .expect(200);
    expect(renamed.body.workspace).toMatchObject({ name: 'Jhon', status: 'archived' });

    await jhon.agent
      .patch(`/api/workspaces/${workspace.id}`)
      .send({ type: 'enterprise' })
      .expect(400);
    await jhon.agent.patch(`/api/workspaces/${workspace.id}`).send({}).expect(400);
  });
});

describe('Workspaces: aislamiento', () => {
  it('un usuario no puede ver ni editar el workspace de otro (404)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const { workspace } = await create(alice, { type: 'enterprise', name: 'TINTO' });

    const read = await bob.agent.get(`/api/workspaces/${workspace.id}`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('TINTO');
    await bob.agent.patch(`/api/workspaces/${workspace.id}`).send({ name: 'Mío' }).expect(404);
    await bob.agent.get(`/api/workspaces/${workspace.id}/conversations`).expect(404);
    await bob.agent.get(`/api/workspaces/${workspace.id}/avatar`).expect(404);

    const bobList = await bob.agent.get('/api/workspaces').expect(200);
    expect(bobList.body.workspaces).toEqual([]);

    const stored = await WorkspaceModel.findOne({ _id: workspace.id, ownerId: alice.user.id });
    expect(stored?.name).toBe('TINTO');
  });

  it('ids inexistentes o malformados responden 404', async () => {
    const alice = await registerUser(app, 'Alice');
    await alice.agent.get(`/api/workspaces/${new mongoose.Types.ObjectId()}`).expect(404);
    await alice.agent.get('/api/workspaces/no-es-un-id').expect(404);
  });
});
