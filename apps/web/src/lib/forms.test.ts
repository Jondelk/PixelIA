import { RegisterInputSchema } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';
import { apiFieldErrors, zodFieldErrors } from './forms';

describe('zodFieldErrors', () => {
  it('devuelve un mensaje por campo', () => {
    const result = RegisterInputSchema.safeParse({ name: '', email: 'x', password: '1' });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors(result.error!);
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('apiFieldErrors', () => {
  it('ignora errores que no son de validación', () => {
    expect(apiFieldErrors(new Error('x'))).toEqual({});
    const err = new ApiRequestError(400, 'VALIDATION_ERROR', 'Datos inválidos', [
      { path: 'name', message: 'Muy corto' },
    ]);
    expect(apiFieldErrors(err)).toEqual({ name: 'Muy corto' });
  });
});
