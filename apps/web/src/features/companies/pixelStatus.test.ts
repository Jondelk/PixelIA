import { describe, expect, it } from 'vitest';
import { companyInitials, pixelStatus } from './pixelStatus';

describe('pixelStatus', () => {
  it('una empresa nueva aún no tiene Pixel configurado', () => {
    expect(pixelStatus('draft')).toEqual({ label: 'Pixel aún no configurado', tone: 'idle' });
  });

  it('cubre todos los estados', () => {
    expect(pixelStatus('ready').tone).toBe('ready');
    expect(pixelStatus('failed').tone).toBe('error');
    expect(pixelStatus('analyzing').tone).toBe('progress');
  });
});

describe('companyInitials', () => {
  it('usa las iniciales de las dos primeras palabras', () => {
    expect(companyInitials('Café Tinto')).toBe('CT');
    expect(companyInitials('constructora norte sas')).toBe('CN');
    expect(companyInitials('Pixel')).toBe('PI');
  });
});
