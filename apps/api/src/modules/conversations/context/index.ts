import type { WorkspaceType } from '@pixel/contracts';
import type { ContextBuilder } from './contextBuilder.js';
import { enterpriseContextBuilder } from './enterpriseContext.builder.js';
import { personalContextBuilder } from './personalContext.builder.js';

export type { ContextBuilder, ContextRequest, ContextResult } from './contextBuilder.js';
export { enterpriseContextBuilder } from './enterpriseContext.builder.js';
export {
  PERSONAL_CONTEXT_NOT_CONFIGURED,
  personalContextBuilder,
} from './personalContext.builder.js';

const BUILDERS: Record<WorkspaceType, ContextBuilder> = {
  enterprise: enterpriseContextBuilder,
  personal: personalContextBuilder,
};

/** Estrategia de contexto según el tipo del workspace. */
export function resolveContextBuilder(type: WorkspaceType): ContextBuilder {
  return BUILDERS[type];
}
