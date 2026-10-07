import type { Company, Workspace, WorkspaceOverview } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { workspaceStatus } from './workspaceStatus';

const now = '2026-10-07T12:00:00.000Z';
const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: '507f1f77bcf86cd799439021',
  ownerId: '507f1f77bcf86cd799439001',
  type: 'enterprise',
  name: 'TINTO',
  slug: 'tinto',
  status: 'active',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
const company = (overrides: Partial<Company> = {}): Company => ({
  id: '507f1f77bcf86cd799439011',
  workspaceId: '507f1f77bcf86cd799439021',
  ownerId: '507f1f77bcf86cd799439001',
  name: 'TINTO',
  slug: 'tinto',
  industry: 'Café',
  description: '',
  logoUrl: null,
  status: 'ready',
  brandDnaVersion: 1,
  avatarVersion: 1,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
const overview = (o: Partial<WorkspaceOverview> = {}): WorkspaceOverview => ({
  workspace: workspace(),
  company: company(),
  ...o,
});

describe('workspaceStatus', () => {
  it('un Pixel Personal aún no tiene funciones', () => {
    expect(
      workspaceStatus(overview({ workspace: workspace({ type: 'personal' }), company: null })),
    ).toEqual({ typeLabel: 'Personal', label: 'Próximamente', tone: 'idle' });
  });

  it('una empresa lista se muestra como configurada', () => {
    expect(workspaceStatus(overview())).toEqual({
      typeLabel: 'Empresa',
      label: 'Configurado',
      tone: 'ready',
    });
  });

  it('un Pixel de empresa sin empresa está sin configurar', () => {
    expect(workspaceStatus(overview({ company: null })).label).toBe('Sin configurar');
  });

  it('refleja el avance de la empresa', () => {
    expect(
      workspaceStatus(
        overview({ company: company({ status: 'onboarding', brandDnaVersion: null }) }),
      ).label,
    ).toBe('Onboarding de marca en curso');
  });

  it('un workspace archivado lo indica', () => {
    expect(workspaceStatus(overview({ workspace: workspace({ status: 'archived' }) })).label).toBe(
      'Archivado',
    );
  });
});
