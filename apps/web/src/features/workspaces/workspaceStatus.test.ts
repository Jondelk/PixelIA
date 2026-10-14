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
  timezone: null,
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
  personal: null,
  avatar: null,
  ...o,
});
const personalPixel = (personal: WorkspaceOverview['personal']) =>
  overview({
    workspace: workspace({ type: 'personal', name: 'Jhon Trochez' }),
    company: null,
    personal,
  });

describe('workspaceStatus', () => {
  it('un Pixel Personal sin onboarding está por configurar', () => {
    expect(
      workspaceStatus(
        personalPixel({
          name: null,
          completedSteps: 0,
          personalDnaVersion: null,
          avatarVersion: null,
        }),
      ),
    ).toEqual({ typeLabel: 'Pixel Personal', label: 'Configurar', tone: 'idle' });
    expect(
      workspaceStatus(
        personalPixel({
          name: 'Jhon',
          completedSteps: 3,
          personalDnaVersion: null,
          avatarVersion: null,
        }),
      ),
    ).toEqual({ typeLabel: 'Pixel Personal', label: 'Configurando', tone: 'progress' });
  });

  it('un Pixel Personal con PersonalDNA está listo', () => {
    expect(
      workspaceStatus(
        personalPixel({
          name: 'Jhon',
          completedSteps: 8,
          personalDnaVersion: 1,
          avatarVersion: null,
        }),
      ),
    ).toEqual({ typeLabel: 'Pixel Personal', label: 'Listo', tone: 'ready' });
  });

  it('una marca con ADN y personaje está lista', () => {
    expect(workspaceStatus(overview())).toEqual({
      typeLabel: 'Pixel Enterprise',
      label: 'Listo',
      tone: 'ready',
    });
  });

  it('un Pixel de empresa sin empresa o sin ADN invita a configurar la marca', () => {
    expect(workspaceStatus(overview({ company: null })).label).toBe('Configurar marca');
    expect(
      workspaceStatus(overview({ company: company({ status: 'draft', brandDnaVersion: null }) }))
        .label,
    ).toBe('Configurar marca');
    expect(
      workspaceStatus(overview({ company: company({ status: 'draft', avatarVersion: null }) }))
        .label,
    ).toBe('ADN listo · personaje pendiente');
  });

  it('refleja el avance de la empresa', () => {
    expect(
      workspaceStatus(
        overview({ company: company({ status: 'onboarding', brandDnaVersion: null }) }),
      ).label,
    ).toBe('Configurando marca');
  });

  it('un workspace archivado lo indica', () => {
    expect(workspaceStatus(overview({ workspace: workspace({ status: 'archived' }) })).label).toBe(
      'Archivado',
    );
  });
});
