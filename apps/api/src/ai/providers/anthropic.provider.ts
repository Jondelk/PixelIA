import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  AIProvider,
  AIResultMeta,
  GenerateStructuredInput,
  GenerateTextInput,
} from '../AIProvider.js';
import { AIProviderError } from '../errors.js';

/** Si el modelo declina, el servidor reintenta con el modelo de respaldo recomendado. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicProviderOptions {
  model: string;
  timeoutMs: number;
  /** Inyectable para tests; por defecto resuelve credenciales del entorno (ANTHROPIC_API_KEY…). */
  client?: Anthropic;
}

function mapError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    return new AIProviderError('rate_limited', 'Límite de peticiones del proveedor de IA', err);
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return new AIProviderError('misconfigured', 'Credenciales de IA inválidas o sin permisos', err);
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new AIProviderError('misconfigured', `Petición de IA inválida: ${err.message}`, err);
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIError) {
    return new AIProviderError('unavailable', 'El proveedor de IA no está disponible', err);
  }
  return new AIProviderError('unavailable', 'Error inesperado del proveedor de IA', err);
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly mode = 'ai' as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new Anthropic({ timeout: options.timeoutMs, maxRetries: 2 });
  }

  private meta(
    start: number,
    usage?: { input_tokens: number; output_tokens: number },
  ): AIResultMeta {
    return {
      provider: this.name,
      model: this.model,
      mode: this.mode,
      latencyMs: Date.now() - start,
      usage: usage && { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    };
  }

  async generateText(input: GenerateTextInput) {
    const start = Date.now();
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: input.maxOutputTokens ?? 4000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: input.effort ?? 'medium' },
        // El system prompt es estable por empresa y versión de ADN: se cachea.
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        messages: input.messages,
      });
      if (response.stop_reason === 'refusal') {
        throw new AIProviderError('refused', 'El modelo declinó la petición');
      }
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      if (!text)
        throw new AIProviderError('invalid_output', 'El modelo devolvió una respuesta vacía');
      return { text, ...this.meta(start, response.usage) };
    } catch (err) {
      throw mapError(err);
    }
  }

  async generateStructuredOutput<T>(input: GenerateStructuredInput<T>) {
    const start = Date.now();
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: input.maxOutputTokens ?? 16000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: {
          effort: input.effort ?? 'medium',
          format: betaZodOutputFormat(input.schema),
        },
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: input.prompt }],
      });
      if (response.stop_reason === 'refusal') {
        throw new AIProviderError('refused', 'El modelo declinó la petición');
      }
      const parsed = input.schema.safeParse(response.parsed_output);
      if (!parsed.success) {
        throw new AIProviderError(
          'invalid_output',
          `Salida fuera de esquema (${input.schemaName})`,
        );
      }
      return { data: parsed.data, ...this.meta(start, response.usage) };
    } catch (err) {
      throw mapError(err);
    }
  }
}
