import { describe, expect, it } from 'vitest';
import { errorMessage, toApiError } from './api';

describe('toApiError', () => {
  it('usa el código y mensaje del contrato ApiError', () => {
    const err = toApiError(404, { error: { code: 'NOT_FOUND', message: 'No existe' } });
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'No existe' });
  });

  it('tolera cuerpos inesperados', () => {
    expect(toApiError(502, '<html>').code).toBe('UNKNOWN');
  });

  it('expone los errores de validación por campo', () => {
    const err = toApiError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: [{ path: 'email', message: 'Email inválido' }, { bogus: true }],
      },
    });
    expect(err.fieldIssues).toEqual([{ path: 'email', message: 'Email inválido' }]);
  });
});

describe('errorMessage', () => {
  it('no filtra mensajes de errores desconocidos', () => {
    expect(errorMessage(new Error('stack interno'))).toBe('Algo salió mal. Inténtalo de nuevo.');
  });
});
