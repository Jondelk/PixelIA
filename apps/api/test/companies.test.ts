import { CompanyListResponseSchema, CompanyResponseSchema } from '@pixel/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

const cafe = {
  name: 'Café Tinto',
  industry: 'Café de especialidad',
  description: 'Café artesanal colombiano',
};

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Empresas: acceso autorizado', () => {
  let owner: Session;
  beforeEach(async () => {
    owner = await registerUser(app, 'Dueña');
  });

  it('crea una empresa en estado draft, con slug y asociada al usuario', async () => {
    const res = await owner.agent.post('/api/companies').send(cafe);

    expect(res.status).toBe(201);
    const { company } = CompanyResponseSchema.parse(res.body);
    expect(company).toMatchObject({
      name: 'Café Tinto',
      slug: 'cafe-tinto',
      industry: 'Café de especialidad',
      status: 'draft',
      logoUrl: null,
      ownerId: owner.user.id,
    });
  });

  it('ignora un ownerId enviado en el cuerpo', async () => {
    const intruderId = new mongoose.Types.ObjectId().toString();
    const res = await owner.agent.post('/api/companies').send({ ...cafe, ownerId: intruderId });
    expect(res.status).toBe(201);
    expect(res.body.company.ownerId).toBe(owner.user.id);
  });

  it('genera slugs únicos por usuario', async () => {
    await owner.agent.post('/api/companies').send(cafe).expect(201);
    const second = await owner.agent.post('/api/companies').send(cafe).expect(201);
    expect(second.body.company.slug).toBe('cafe-tinto-2');
  });

  it('lista, consulta y actualiza sus empresas', async () => {
    const created = await owner.agent.post('/api/companies').send(cafe).expect(201);
    await owner.agent
      .post('/api/companies')
      .send({ name: 'Constructora Norte', industry: 'Construcción' })
      .expect(201);
    const id = created.body.company.id as string;

    const list = await owner.agent.get('/api/companies').expect(200);
    const { companies } = CompanyListResponseSchema.parse(list.body);
    expect(companies.map((company) => company.name)).toEqual(['Constructora Norte', 'Café Tinto']);

    const detail = await owner.agent.get(`/api/companies/${id}`).expect(200);
    expect(detail.body.company.name).toBe('Café Tinto');

    const patched = await owner.agent
      .patch(`/api/companies/${id}`)
      .send({ description: 'Tostado en Huila', logoUrl: 'https://cdn.example.com/logo.png' })
      .expect(200);
    expect(patched.body.company).toMatchObject({
      description: 'Tostado en Huila',
      logoUrl: 'https://cdn.example.com/logo.png',
      slug: 'cafe-tinto',
    });
  });

  it('valida la creación y la actualización', async () => {
    const invalid = await owner.agent.post('/api/companies').send({ name: 'A' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const created = await owner.agent.post('/api/companies').send(cafe).expect(201);
    const id = created.body.company.id as string;
    await owner.agent.patch(`/api/companies/${id}`).send({}).expect(400);
    await owner.agent.patch(`/api/companies/${id}`).send({ status: 'ready' }).expect(400);
    await owner.agent.patch(`/api/companies/${id}`).send({ ownerId: owner.user.id }).expect(400);
  });

  it('exige sesión en todos los endpoints de empresas', async () => {
    const created = await owner.agent.post('/api/companies').send(cafe).expect(201);
    const id = created.body.company.id as string;

    await request(app).get('/api/companies').expect(401);
    await request(app).post('/api/companies').send(cafe).expect(401);
    await request(app).get(`/api/companies/${id}`).expect(401);
    await request(app).patch(`/api/companies/${id}`).send({ name: 'Hackeado' }).expect(401);
  });
});

describe('Empresas: intento de acceder a una empresa ajena', () => {
  let alice: Session;
  let bob: Session;
  let aliceCompanyId: string;

  beforeEach(async () => {
    alice = await registerUser(app, 'Alice');
    bob = await registerUser(app, 'Bob');
    const res = await alice.agent.post('/api/companies').send(cafe).expect(201);
    aliceCompanyId = res.body.company.id as string;
  });

  it('no aparece en el listado de otro usuario', async () => {
    const res = await bob.agent.get('/api/companies').expect(200);
    expect(res.body.companies).toEqual([]);
  });

  it('GET de una empresa ajena responde 404, igual que una inexistente', async () => {
    const foreign = await bob.agent.get(`/api/companies/${aliceCompanyId}`);
    const missing = await bob.agent.get(
      `/api/companies/${new mongoose.Types.ObjectId().toString()}`,
    );
    const malformed = await bob.agent.get('/api/companies/no-es-un-id');

    for (const res of [foreign, missing, malformed]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toContain('Café Tinto');
    }
    expect(foreign.body.error.message).toBe(missing.body.error.message);
  });

  it('PATCH de una empresa ajena responde 404 y no la modifica', async () => {
    const res = await bob.agent
      .patch(`/api/companies/${aliceCompanyId}`)
      .send({ name: 'Hackeada' });
    expect(res.status).toBe(404);

    const stored = await CompanyModel.findById(aliceCompanyId);
    expect(stored?.name).toBe('Café Tinto');
  });

  it('los submódulos de una empresa ajena también responden 404', async () => {
    for (const path of ['brand-dna', 'avatar', 'conversations', 'memories']) {
      const res = await bob.agent.get(`/api/companies/${aliceCompanyId}/${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  it('la dueña sigue teniendo acceso', async () => {
    await alice.agent.get(`/api/companies/${aliceCompanyId}`).expect(200);
  });
});
