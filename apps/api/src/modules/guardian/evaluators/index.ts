import type { GuardianEvaluator } from '../guardian.types.js';
import { claimsEvaluator } from './claims.evaluator.js';
import { communicationEvaluator } from './communication.evaluator.js';
import { restrictionsEvaluator } from './restrictions.evaluator.js';
import {
  campaignAlignmentEvaluator,
  contentEvaluator,
  identityEvaluator,
  strategyEvaluator,
  visualDirectionEvaluator,
} from './semantic.evaluators.js';

/*
 * Evaluadores del Brand Guardian. Para añadir uno (VisualAssetEvaluator, LogoEvaluator,
 * MemoryEvaluator… en etapas futuras) basta con implementar GuardianEvaluator y añadirlo aquí;
 * su dimensión solo cuenta si `supports()` aplica al recurso.
 */
export const GUARDIAN_EVALUATORS: GuardianEvaluator[] = [
  identityEvaluator,
  communicationEvaluator,
  claimsEvaluator,
  restrictionsEvaluator,
  strategyEvaluator,
  campaignAlignmentEvaluator,
  contentEvaluator,
  visualDirectionEvaluator,
];

export { classifyClaims } from './claims.evaluator.js';
