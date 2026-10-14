import { AuthResponseSchema } from '@pixel/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/modules/auth/session.js';
import { UserModel } from '../src/modules/auth/user.model.js';
import { buildTestApp, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

const credentials = { name: 'Ana Rojas', email: 'Ana@CafeTinto.co', password: 'tinto-2026!' };

function sessionCookie(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

describe('POST /api/auth/register', () => {
  it('crea el usuario, abre sesión y nunca expone la contraseña', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(AuthResponseSchema.parse(res.body).user).toMatchObject({
      name: 'Ana Rojas',
      email: 'ana@cafetinto.co',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|tinto-2026/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const stored = await UserModel.findOne({ email: 'ana@cafetinto.co' }).select('+passwordHash');
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.passwordHash).not.toContain('tinto-2026');
  });

  it('rechaza un email ya registrado (sin distinguir mayúsculas)', async () => {
    await request(app).post('/api/auth/register').send(credentials).expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: 'ANA@cafetinto.CO' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('valida los datos de entrada', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'no-es-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details as { path: string }[]).map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  it('inicia sesión con credenciales correctas', async () => {
    await request(app).post('/api/auth/register').send(credentials).expect(201);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ' ANA@cafetinto.co ', password: credentials.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ana@cafetinto.co');
    expect(sessionCookie(res)).toBeDefined();
  });

  it('responde igual ante contraseña incorrecta y email inexistente', async () => {
    await request(app).post('/api/auth/register').send(credentials).expect(201);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'otra-cosa-123' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@pixel.test', password: 'otra-cosa-123' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(sessionCookie(res)).toBeUndefined();
    }
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });
});

describe('GET /api/auth/me y logout', () => {
  it('devuelve el usuario de la sesión y la cierra con logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(credentials).expect(201);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ana@cafetinto.co');

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rechaza peticiones sin sesión o con un token manipulado', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.`)
      .expect(401);
  });

  it('rechaza una sesión cuyo usuario ya no existe', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send(credentials).expect(201);
    await UserModel.deleteOne({ _id: new mongoose.Types.ObjectId(res.body.user.id as string) });
    await agent.get('/api/auth/me').expect(401);
  });
});
