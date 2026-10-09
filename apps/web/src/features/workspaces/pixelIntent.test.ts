import type { Workspace, WorkspaceOverview } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { isPixelIntent, pixelIntentPath, resolvePixelIntent } from './pixelIntent';

const now = '2026-10-08T12:00:00.000Z';
let seq = 0;
const pixel = (overrides: Partial<Workspace> = {}): WorkspaceOverview => {
  seq += 1;
  return {
    workspace: {
      id: `507f1f77bcf86cd7994390${String(seq).padStart(2, '0')}`,
      ownerId: '507f1f77bcf86cd799439001',
      type: 'enterprise',
      name: 'TINTO',
      slug: `tinto-${seq}`,
      status: 'active',
      timezone: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    company: null,
    personal: null,
  };
};

describe('pixelIntent', () => {
  it('solo reconoce las intenciones públicas', () => {
    expect(isPixelIntent('personal')).toBe(true);
    expect(isPixelIntent('enterprise')).toBe(true);
    expect(isPixelIntent('admin')).toBe(false);
    expect(pixelIntentPath('personal')).toBe('/pixels/start?intent=personal');
  });

  it('personal: abre el Pixel Personal existente en lugar de crear otro', () => {
    const personal = pixel({ type: 'personal' });
    expect(resolvePixelIntent('personal', [pixel(), personal])).toEqual({
      kind: 'navigate',
      to: `/workspace/${personal.workspace.id}`,
    });
  });

  it('personal: sin Pixel Personal hay que crearlo (acción explícita del usuario)', () => {
    expect(resolvePixelIntent('personal', [pixel()])).toEqual({ kind: 'create-personal' });
  });

  it('enterprise: sin empresas lleva al alta; con una la abre; con varias, al selector', () => {
    expect(resolvePixelIntent('enterprise', [pixel({ type: 'personal' })])).toEqual({
      kind: 'navigate',
      to: '/companies/new',
    });
    const only = pixel();
    expect(resolvePixelIntent('enterprise', [only, pixel({ status: 'archived' })])).toEqual({
      kind: 'navigate',
      to: `/workspace/${only.workspace.id}`,
    });
    expect(resolvePixelIntent('enterprise', [pixel(), pixel()])).toEqual({
      kind: 'navigate',
      to: '/dashboard',
    });
  });

  it('una intención desconocida va al selector de Pixels', () => {
    expect(resolvePixelIntent('otra', [])).toEqual({ kind: 'navigate', to: '/dashboard' });
    expect(resolvePixelIntent(null, [])).toEqual({ kind: 'navigate', to: '/dashboard' });
  });
});
