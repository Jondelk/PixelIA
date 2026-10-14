import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '../src/ai/errors.js';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';

function fakeClient(create: (params: Record<string, unknown>) => unknown) {
  const spy = vi.fn(async (params: Record<string, unknown>) => create(params));
  const client = { beta: { messages: { create: spy, parse: spy } } } as unknown as Anthropic;
  return { client, spy };
}

const message = (overrides: Record<string, unknown> = {}) => ({
  content: [{ type: 'text', text: 'Hola desde Claude' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
  ...overrides,
});

describe('AnthropicProvider', () => {
  it('envía el modelo, el system cacheado, fallback de servidor y esfuerzo (sin temperature)', async () => {
    const { client, spy } = fakeClient(() => message());
    const provider = new AnthropicProvider({ model: 'claude-opus-5-5', timeoutMs: 1000, client });

    const result = await provider.generateText({
      system: 'Eres Pixel',
      messages: [{ role: 'user', content: 'Hola' }],
    });

    expect(result).toMatchObject({
      text: 'Hola desde Claude',
      provider: 'anthropic',
      mode: 'ai',
      model: 'claude-opus-5-5',
    });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    const params = spy.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: 'Eres Pixel', cache_control: { type: 'ephemeral' } }],
    });
    expect(params).not.toHaveProperty('temperature');
  });

  it('clasifica rechazos, respuestas vacías y errores del SDK', async () => {
    const refused = new AnthropicProvider({
      model: 'm',
      timeoutMs: 1000,
      client: fakeClient(() => message({ stop_reason: 'refusal', content: [] })).client,
    });
    await expect(refused.generateText({ system: 's', messages: [] })).rejects.toMatchObject({
      kind: 'refused',
    });

    const empty = new AnthropicProvider({
      model: 'm',
      timeoutMs: 1000,
      client: fakeClient(() => message({ content: [] })).client,
    });
    await expect(empty.generateText({ system: 's', messages: [] })).rejects.toMatchObject({
      kind: 'invalid_output',
    });

    const limited = new AnthropicProvider({
      model: 'm',
      timeoutMs: 1000,
      client: fakeClient(() => {
        throw new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers());
      }).client,
    });
    const err = await limited.generateText({ system: 's', messages: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err).toMatchObject({ kind: 'rate_limited' });
  });
});
