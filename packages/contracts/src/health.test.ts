import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, HealthResponseSchema, ObjectIdSchema } from './index.js';

describe('HealthResponseSchema', () => {
  it('acepta una respuesta válida', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      service: 'pixel-api',
      version: '0.1.0',
      uptimeSeconds: 3,
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un servicio distinto', () => {
    const result = HealthResponseSchema.safeParse({ status: 'ok', service: 'otro' });
    expect(result.success).toBe(false);
  });
});

describe('ApiErrorSchema', () => {
  it('rechaza códigos desconocidos', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'X', message: 'm' } }).success).toBe(false);
  });
});

describe('ObjectIdSchema', () => {
  it('valida ObjectIds hexadecimales de 24 caracteres', () => {
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(ObjectIdSchema.safeParse('123').success).toBe(false);
  });
});
