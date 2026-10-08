import type { Env } from '../config/env.js';
import type { Logger } from '../lib/logger.js';
import type { AIProvider } from './AIProvider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { DemoProvider } from './providers/demo.provider.js';

export type { AIChatTurn, AIProvider, AIResultMeta } from './AIProvider.js';
export { AIProviderError } from './errors.js';

/**
 * Proveedor de IA según configuración. Añadir otro proveedor = nueva clase en ./providers
 * que implemente AIProvider + un caso aquí. Nada fuera de src/ai importa SDKs de IA.
 */
export function createAIProvider(
  env: Pick<Env, 'AI_PROVIDER' | 'AI_MODEL' | 'AI_TIMEOUT_MS'>,
  logger?: Logger,
): AIProvider {
  switch (env.AI_PROVIDER) {
    case 'anthropic':
      logger?.info(`IA: Anthropic (${env.AI_MODEL})`);
      return new AnthropicProvider({ model: env.AI_MODEL, timeoutMs: env.AI_TIMEOUT_MS });
    case 'demo':
      logger?.warn('IA en modo demo: Pixel responde con reglas locales, sin modelo de lenguaje');
      return new DemoProvider();
  }
}
export {
  extractPlanningPayload,
  PLANNING_SCHEMA_NAME,
  PlanningPayloadSchema,
  planningPrompt,
  type PlanningPayload,
} from './contentPlanningPayload.js';
