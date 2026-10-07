import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import type { AIProvider } from '../../src/ai/index.js';
import { DemoProvider } from '../../src/ai/providers/demo.provider.js';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';

export const testEnv = loadEnv({ NODE_ENV: 'test', BCRYPT_ROUNDS: '4', LOG_LEVEL: 'silent' });

export function buildTestApp(ai: AIProvider = new DemoProvider()) {
  return createApp({
    env: testEnv,
    logger: createLogger({ level: 'silent', format: 'json' }),
    getDatabaseStatus: () => 'connected',
    ai,
  });
}

/** Conecta Mongoose a una base de datos aislada para el archivo de test y la limpia entre tests. */
export function useTestDatabase() {
  beforeAll(async () => {
    await mongoose.connect(inject('mongoUri'), {
      dbName: `pixel_test_${randomUUID().slice(0, 8)}`,
    });
    await mongoose.connection.syncIndexes();
  });

  afterEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

let counter = 0;

/** Registra un usuario y devuelve un agente de supertest con su cookie de sesión. */
export async function registerUser(app: ReturnType<typeof buildTestApp>, name = 'Usuario') {
  counter += 1;
  const agent = request.agent(app);
  const email = `user${counter}-${randomUUID().slice(0, 6)}@pixel.test`;
  const res = await agent
    .post('/api/auth/register')
    .send({ name, email, password: 'contraseña-segura' })
    .expect(201);
  return { agent, user: res.body.user as { id: string; email: string; name: string } };
}
