import { describe, expect, it } from 'vitest';
import {
  CreateCompanyInputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  UpdateCompanyInputSchema,
} from './index.js';

describe('RegisterInputSchema', () => {
  it('normaliza el email y recorta el nombre', () => {
    const data = RegisterInputSchema.parse({
      name: '  Ana  ',
      email: '  Ana@Cafe.CO ',
      password: 'secreto123',
    });
    expect(data).toEqual({ name: 'Ana', email: 'ana@cafe.co', password: 'secreto123' });
  });

  it('exige contraseñas de al menos 8 caracteres y email válido', () => {
    const result = RegisterInputSchema.safeParse({
      name: 'Ana',
      email: 'no-es-email',
      password: '123',
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('LoginInputSchema', () => {
  it('requiere contraseña', () => {
    expect(LoginInputSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('Company inputs', () => {
  it('crea con descripción vacía por defecto', () => {
    const data = CreateCompanyInputSchema.parse({ name: 'Café Tinto', industry: 'Café' });
    expect(data.description).toBe('');
  });

  it('rechaza logos que no son http(s)', () => {
    const result = CreateCompanyInputSchema.safeParse({
      name: 'Café Tinto',
      industry: 'Café',
      logoUrl: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });

  it('el PATCH exige al menos un campo y rechaza campos no editables', () => {
    expect(UpdateCompanyInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateCompanyInputSchema.safeParse({ status: 'ready' }).success).toBe(false);
    expect(UpdateCompanyInputSchema.safeParse({ ownerId: 'x' }).success).toBe(false);
    expect(UpdateCompanyInputSchema.safeParse({ logoUrl: null }).success).toBe(true);
  });
});
