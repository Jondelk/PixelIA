import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonalOnboardingSchema, type Project } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { createContentPlanningEngine } from '../src/modules/content-plans/contentPlanning.engine.js';
import { generatePersonalDnaContent } from '../src/modules/personal/personalDna.generator.js';
import { creativeDirector } from './fixtures/personal.js';

/**
 * Prueba con datos reales y el modelo real (Prompt 10 §54). Solo corre con ANTHROPIC_API_KEY
 * (cuesta dinero y necesita red). La equivalente con el proveedor demo corre siempre en
 * contentPlanning.engine.test.ts y contentPlans.test.ts.
 */
const live = Boolean(process.env.ANTHROPIC_API_KEY);
/** Plan generado, para revisarlo a mano (incluye propuestas aceptadas y `discardedItems`). */
const LIVE_OUTPUT = join(tmpdir(), 'pixel-content-plan-live.json');

describe.skipIf(!live)('Claude real: plan de un director creativo', () => {
  it(
    'usa su ADN y su proyecto, solo Instagram, formatos preferidos y cada propuesta justificada',
    { timeout: 240_000 },
    async () => {
      const project: Project = {
        id: '64b7f0c2a1b2c3d4e5f60010',
        workspaceId: '64b7f0c2a1b2c3d4e5f60001',
        campaignId: null,
        name: 'Pixel Personal MVP',
        description: 'Director creativo con IA que aprende el ADN personal de cada persona',
        type: 'creative',
        status: 'active',
        priority: 'high',
        goals: ['lanzar el MVP'],
        startDate: null,
        dueDate: null,
        progress: 0,
        stats: { tasks: 0, completedTasks: 0, contentItems: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const engine = createContentPlanningEngine({
        ai: new AnthropicProvider({
          model: process.env.AI_MODEL ?? 'claude-opus-5-5',
          timeoutMs: 180_000,
        }),
        logger: createLogger({ level: 'silent', format: 'json' }),
      });
      const proposal = await engine.plan({
        workspaceId: project.workspaceId,
        personalDna: generatePersonalDnaContent(PersonalOnboardingSchema.parse(creativeDirector)),
        activeProjects: [project],
        recentContent: [],
        previousProposals: [],
        requestedPeriod: { startDate: '2026-10-12', endDate: '2026-10-25' },
        requestedPlatforms: ['instagram'],
        tzOffset: 300,
      });
      // Se guarda ANTES de las aserciones: el plan sirve para revisar y ajustar PLANNING_SYSTEM
      // aunque la prueba falle (docs/CONTENT-PLANNER.md §10).
      writeFileSync(LIVE_OUTPUT, JSON.stringify(proposal, null, 2));
      expect(proposal.meta.mode).toBe('ai');
      expect(proposal.items.length).toBeGreaterThanOrEqual(3);
      expect(proposal.items.every((item) => item.platform === 'instagram')).toBe(true);
      expect(
        proposal.items.filter((item) => ['reel', 'carousel', 'story'].includes(item.format)).length,
      ).toBeGreaterThanOrEqual(Math.ceil(proposal.items.length * 0.66));
      expect(proposal.items.some((item) => item.projectId === project.id)).toBe(true);
      expect(proposal.items.every((item) => item.rationale.length > 30)).toBe(true);
      expect(new Set(proposal.items.map((item) => item.angle)).size).toBeGreaterThan(1);
    },
  );
});
