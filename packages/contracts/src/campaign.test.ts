import { describe, expect, it } from 'vitest';
import {
  CreateCampaignSchema,
  CreateContentItemSchema,
  CreateProjectSchema,
  deliverableTarget,
  GenerateCampaignSchema,
  GeneratedCampaignStrategySchema,
  ProjectSchema,
  RegenerateCampaignStrategySchema,
  UpdateCampaignDeliverableSchema,
  UpdateCampaignSchema,
} from './index.js';

describe('Campaign', () => {
  it('manual: bastan nombre y objetivo; el resto toma valores por defecto', () => {
    expect(CreateCampaignSchema.parse({ name: ' Navidad ', objective: ' Vender ' })).toMatchObject({
      name: 'Navidad',
      objective: 'Vender',
      status: 'draft',
      campaignType: null,
      channels: [],
      startDate: null,
    });
  });

  it('con Pixel basta el objetivo; el cuerpo es estricto', () => {
    expect(GenerateCampaignSchema.parse({ objective: 'Lanzar' }).name).toBeUndefined();
    expect(
      GenerateCampaignSchema.safeParse({ objective: 'Lanzar', workspaceId: 'x' }).success,
    ).toBe(false);
    expect(CreateCampaignSchema.safeParse({ name: 'X' }).success).toBe(false);
  });

  it('fechas en orden y edición parcial', () => {
    expect(
      CreateCampaignSchema.safeParse({
        name: 'X',
        objective: 'Y',
        startDate: '2026-12-10T12:00:00.000Z',
        endDate: '2026-12-01T12:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(UpdateCampaignSchema.safeParse({}).success).toBe(false);
    expect(UpdateCampaignSchema.parse({ status: 'active' })).toEqual({ status: 'active' });
    expect(RegenerateCampaignStrategySchema.parse({})).toEqual({});
  });

  it('listas del brief: recorta, quita vacíos y limita', () => {
    const parsed = CreateCampaignSchema.parse({
      name: 'X',
      objective: 'Y',
      channels: [' Instagram ', '', 'Punto de venta'],
    });
    expect(parsed.channels).toEqual(['Instagram', 'Punto de venta']);
    expect(
      CreateCampaignSchema.safeParse({ name: 'X', objective: 'Y', channels: Array(9).fill('a') })
        .success,
    ).toBe(false);
  });
});

describe('CampaignDeliverable', () => {
  it('content → ContentItem; el resto → Project', () => {
    expect(deliverableTarget('content')).toBe('content_item');
    for (const type of ['design', 'video', 'photo', 'web', 'print', 'event', 'other'] as const) {
      expect(deliverableTarget(type)).toBe('project');
    }
  });

  it('editar: campos permitidos (sin estado ni conversiones)', () => {
    expect(UpdateCampaignDeliverableSchema.safeParse({ title: 'Reel' }).success).toBe(true);
    expect(UpdateCampaignDeliverableSchema.safeParse({ status: 'converted' }).success).toBe(false);
    expect(
      UpdateCampaignDeliverableSchema.safeParse({ convertedProjectId: '64b7f0c2a1b2c3d4e5f60001' })
        .success,
    ).toBe(false);
  });
});

describe('Relación opcional con Project y ContentItem', () => {
  it('campaignId opcional (null por defecto) y compatible con datos sin el campo', () => {
    expect(CreateProjectSchema.parse({ name: 'X' }).campaignId).toBeNull();
    expect(CreateContentItemSchema.parse({ title: 'X' }).campaignId).toBeNull();
    const legacy = {
      id: '64b7f0c2a1b2c3d4e5f60010',
      workspaceId: '64b7f0c2a1b2c3d4e5f60001',
      name: 'Antiguo',
      description: null,
      type: 'personal',
      status: 'active',
      priority: 'medium',
      goals: [],
      startDate: null,
      dueDate: null,
      progress: 0,
      stats: { tasks: 0, completedTasks: 0, contentItems: 0 },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    expect(ProjectSchema.parse(legacy).campaignId).toBeNull();
  });
});

describe('GeneratedCampaignStrategySchema', () => {
  it('exige lo esencial y limita el tamaño (salida de la IA)', () => {
    expect(GeneratedCampaignStrategySchema.safeParse({}).success).toBe(false);
    const shape = GeneratedCampaignStrategySchema.shape;
    expect(shape.deliverables.safeParse([]).success).toBe(false);
    expect(shape.insightType.safeParse('validated_insight').success).toBe(false);
    expect(shape.concept.safeParse('x'.repeat(201)).success).toBe(false);
  });
});
