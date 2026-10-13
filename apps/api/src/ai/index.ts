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
export {
  CAMPAIGN_SCHEMA_NAME,
  CampaignPayloadSchema,
  campaignPrompt,
  extractCampaignPayload,
  type CampaignPayload,
} from './campaignStrategyPayload.js';
export {
  ENTERPRISE_PLANNING_SCHEMA_NAME,
  EnterprisePlanningPayloadSchema,
  enterprisePlanningPrompt,
  extractEnterprisePlanningPayload,
  type EnterprisePlanningPayload,
} from './enterprisePlanningPayload.js';
export {
  extractPixelCommandPayload,
  PIXEL_COMMAND_SCHEMA_NAME,
  PIXEL_COMMAND_SYSTEM,
  PixelCommandPayloadSchema,
  pixelCommandPrompt,
  type PixelCommandPayload,
} from './pixelCommandPayload.js';
export { fold, interpretPixelRequest } from './pixelCommandRules.js';
export {
  extractGuardianCorrectionPayload,
  extractGuardianPayload,
  GUARDIAN_CORRECTION_SCHEMA_NAME,
  GUARDIAN_CORRECTION_SYSTEM,
  GUARDIAN_EVALUATION_SCHEMA_NAME,
  GUARDIAN_SYSTEM,
  GuardianCorrectionPayloadSchema,
  guardianCorrectionPrompt,
  GuardianPayloadSchema,
  guardianPrompt,
  type GuardianCorrectionPayload,
  type GuardianPayload,
} from './guardianPayload.js';
export {
  brandProfileOf,
  brandSignalSources,
  brandSignals,
  familyClash,
  familyHits,
  signalsIn,
  STYLE_FAMILIES,
  type GuardianBrandProfile,
  type StyleFamily,
} from './guardianLexicon.js';
export {
  extractMemoryPayload,
  MEMORY_SYNTHESIS_SCHEMA_NAME,
  MEMORY_SYSTEM,
  MemoryPayloadSchema,
  memoryPrompt,
  type MemoryPayload,
} from './creativeMemoryPayload.js';
export { composeDemoMemorySynthesis } from './providers/demoCreativeMemory.js';
export {
  composeDemoGuardianCorrection,
  composeDemoGuardianEvaluation,
} from './providers/demoGuardian.js';
