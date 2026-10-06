import { HealthResponseSchema, type DatabaseStatus } from '@pixel/contracts';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { notFound } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const logger = createLogger({ level: 'silent', format: 'json' });

function buildApp(database: DatabaseStatus = 'connected') {
  return createApp({
    env: { CORS_ORIGINS: ['http://localhost:5173'] },
    logger,
    getDatabaseStatus: () => database,
  });
}

describe('GET /api/health', () => {
  it('responde ok cuando la base de datos está conectada', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'pixel-api', database: 'connected' });
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('responde degraded (503) sin base de datos', async () => {
    const res = await request(buildApp('disconnected')).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'disconnected' });
  });
});

describe('manejo de errores', () => {
  it('devuelve 404 con forma ApiError para rutas desconocidas', async () => {
    const res = await request(buildApp()).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('devuelve 400 ante JSON malformado', async () => {
    const res = await request(buildApp())
      .post('/api/auth')
      .set('Content-Type', 'application/json')
      .send('{malformado');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('traduce AppError, ZodError y errores desconocidos', async () => {
    const app = express();
    app.get('/app-error', () => {
      throw notFound('No está');
    });
    app.get('/zod', () => {
      z.object({ name: z.string() }).parse({});
    });
    app.get('/boom', async () => {
      throw new Error('detalle interno');
    });
    app.use(errorHandler(logger));

    const appError = await request(app).get('/app-error');
    expect(appError.status).toBe(404);
    expect(appError.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'No está' });

    const zod = await request(app).get('/zod');
    expect(zod.status).toBe(400);
    expect(zod.body.error.code).toBe('VALIDATION_ERROR');
    expect(zod.body.error.details[0].path).toBe('name');

    const boom = await request(app).get('/boom');
    expect(boom.status).toBe(500);
    expect(boom.body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(boom.body)).not.toContain('detalle interno');
  });
});

describe('CORS', () => {
  it('permite orígenes configurados con credenciales', async () => {
    const res = await request(buildApp()).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('no autoriza orígenes desconocidos', async () => {
    const res = await request(buildApp()).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
