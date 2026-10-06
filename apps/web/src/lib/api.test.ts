import { describe, expect, it } from 'vitest';
import { toApiError } from './api';

describe('toApiError', () => {
  it('usa el código y mensaje del contrato ApiError', () => {
    const err = toApiError(404, { error: { code: 'NOT_FOUND', message: 'No existe' } });
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'No existe' });
  });

  it('tolera cuerpos inesperados', () => {
    expect(toApiError(502, '<html>').code).toBe('UNKNOWN');
  });
});
