import { BrandOnboardingSchema } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { buildPixelContext } from '../src/modules/conversations/pixelContext.builder.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { jaccard } from './support/similarity.js';

/**
 * Prueba con el modelo real. Solo corre con ANTHROPIC_API_KEY definido (cuesta dinero y
 * necesita red); en CI y en local sin clave se omite. La prueba equivalente con el proveedor
 * demo se ejecuta siempre en chat.test.ts.
 */
const live = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!live)('Claude real: misma pregunta, empresas distintas', () => {
  it(
    'responde con enfoques distintos para café artesanal y startup tecnológica',
    { timeout: 240_000 },
    async () => {
      const provider = new AnthropicProvider({
        model: process.env.AI_MODEL ?? 'claude-opus-5-5',
        timeoutMs: 120_000,
      });
      const question = 'Necesito una campaña para redes.';
      const ask = async (name: string, answers: typeof cafeTinto) => {
        const dna = generateBrandDna(BrandOnboardingSchema.parse(answers));
        const context = buildPixelContext({
          company: { name },
          brandDna: {
            ...dna,
            id: '507f1f77bcf86cd799439011',
            companyId: '507f1f77bcf86cd799439012',
            version: 1,
            generator: { kind: 'deterministic', version: 'rules-1' },
            createdAt: new Date().toISOString(),
          },
          avatar: null,
          history: [],
          userMessage: question,
        });
        return (await provider.generateText({ system: context.system, messages: context.messages }))
          .text;
      };
      const [cafe, nova] = await Promise.all([
        ask('Café Tinto', cafeTinto),
        ask('Nova Labs', novaLabs),
      ]);
      expect(jaccard(cafe, nova)).toBeLessThan(0.35);
      expect(cafe).not.toMatch(/Nova Labs/);
      expect(nova).not.toMatch(/Café Tinto|Huila/);
    },
  );
});
