import { GeneratedCreativeMemorySynthesisSchema } from '@pixel/contracts';
import type { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MEMORY_SYNTHESIS_SCHEMA_NAME, MEMORY_SYSTEM, memoryPrompt } from '../src/ai/index.js';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';
import { createLogger } from '../src/lib/logger.js';
import type { CreativeDecisionEventDocument } from '../src/modules/creative-memory/creativeDecisionEvent.model.js';
import { validateSynthesis } from '../src/modules/creative-memory/memory.synthesizer.js';
import { createPixelIntentResolver } from '../src/modules/pixel-command/pixelIntent.resolver.js';

/**
 * Creative Memory con Claude real (Prompt 16 §107). Solo corre con ANTHROPIC_API_KEY (cuesta dinero
 * y necesita red); sin ella queda SKIPPED. Las equivalentes con el proveedor demo corren siempre en
 * creativeMemory.test.ts y creativeMemory.unit.test.ts.
 */
const live = Boolean(process.env.ANTHROPIC_API_KEY);
const provider = () =>
  new AnthropicProvider({ model: process.env.AI_MODEL ?? 'claude-opus-5-5', timeoutMs: 120_000 });

describe.skipIf(!live)('Claude real: Creative Memory', () => {
  it(
    'sintetizador: un patrón sustentado por las ediciones y validado contra ellas',
    { timeout: 240_000 },
    async () => {
      const pairs: [string, string][] = [
        ['Del origen a tu taza', '¿Sabes de dónde viene tu taza?'],
        ['La finca en cada grano', '¿Conoces la finca de tu grano?'],
        ['Tostión semanal', '¿Por qué tostamos cada semana?'],
      ];
      const refs = new Map(
        pairs.map(([before, after], index) => [
          `EVENT_${index + 1}`,
          {
            _id: `64b7f0c2a1b2c3d4e5f6001${index}` as unknown as Types.ObjectId,
            resourceId: `64b7f0c2a1b2c3d4e5f6002${index}`,
            contentPlanId: null,
            sourceEventKey: `k${index}`,
            description: 'Editaste el título de una pieza que propuso Pixel',
            before: [{ field: 'Título', value: before }],
            after: [{ field: 'Título', value: after }],
          } as unknown as CreativeDecisionEventDocument,
        ]),
      );
      const result = await provider().generateStructuredOutput({
        system: MEMORY_SYSTEM,
        prompt: memoryPrompt({
          contextType: 'enterprise',
          events: [...refs].map(([ref, event]) => ({
            ref,
            description: event.description,
            before: event.before,
            after: event.after,
          })),
        }),
        schema: GeneratedCreativeMemorySynthesisSchema,
        schemaName: MEMORY_SYNTHESIS_SCHEMA_NAME,
        maxOutputTokens: 800,
        effort: 'low',
      });
      const output = GeneratedCreativeMemorySynthesisSchema.parse(result.data);
      const valid = validateSynthesis(output, refs, 'enterprise');
      // Si propone algo, debe sobrevivir a la validación (refs reales, sin hechos ni temas inventados).
      if (output.shouldCreateCandidate) expect(valid).not.toBeNull();
      expect(output.evidenceRefs.every((ref) => refs.has(ref))).toBe(true);
    },
  );

  it(
    'intérprete: persistente → manage_memory; temporal ("hoy no…") → la solicitud actual',
    { timeout: 240_000 },
    async () => {
      const resolver = createPixelIntentResolver({
        ai: provider(),
        logger: createLogger({ level: 'silent', format: 'json' }),
      });
      const resolve = (userRequest: string) =>
        resolver.resolve({ workspaceType: 'enterprise', userRequest, previous: null });
      const remember = await resolve('De ahora en adelante evita los CTA de urgencia para TINTO');
      expect(remember.intent).toBe('manage_memory');
      expect(remember.entities.memoryAction).toBe('remember');
      const temporary = await resolve('Hoy no quiero Stories en el plan de esta semana');
      expect(temporary.intent).toBe('plan_content');
      expect(temporary.entities.excludedFormats).toContain('story');
    },
  );
});
