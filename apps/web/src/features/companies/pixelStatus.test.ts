import { describe, expect, it } from 'vitest';
import { companyInitials, pixelStatus } from './pixelStatus';

describe('pixelStatus', () => {
  it('una empresa nueva aún no está configurada', () => {
    expect(pixelStatus({ status: 'draft', brandDnaVersion: null })).toEqual({
      label: 'Marca sin configurar',
      tone: 'idle',
    });
  });

  it('refleja el avance del onboarding y del ADN', () => {
    expect(pixelStatus({ status: 'onboarding', brandDnaVersion: null }).label).toBe(
      'Onboarding de marca en curso',
    );
    expect(pixelStatus({ status: 'onboarding', brandDnaVersion: 2 })).toEqual({
      label: 'ADN de marca listo · personaje pendiente',
      tone: 'learned',
    });
  });

  it('cubre los estados finales', () => {
    expect(pixelStatus({ status: 'ready', brandDnaVersion: 1 }).tone).toBe('ready');
    expect(pixelStatus({ status: 'failed', brandDnaVersion: null }).tone).toBe('error');
  });
});

describe('companyInitials', () => {
  it('usa las iniciales de las dos primeras palabras', () => {
    expect(companyInitials('Café Tinto')).toBe('CT');
    expect(companyInitials('constructora norte sas')).toBe('CN');
    expect(companyInitials('Pixel')).toBe('PI');
  });
});
