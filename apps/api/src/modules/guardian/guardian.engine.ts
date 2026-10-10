import {
  GeneratedGuardianEvaluationSchema,
  GUARDIAN_DIMENSIONS,
  type GeneratedGuardianEvaluation,
  type GuardianDimension,
  type GuardianFinding,
  type GuardianStatus,
} from '@pixel/contracts';
import {
  brandProfileOf,
  composeDemoGuardianEvaluation,
  GUARDIAN_EVALUATION_SCHEMA_NAME,
  GUARDIAN_SYSTEM,
  guardianPrompt,
  type AIProvider,
  type GuardianPayload,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import { buildVocabulary } from '../content-plans/contentPlanning.grounding.js';
import { GUARDIAN_EVALUATORS } from './evaluators/index.js';
import { buildReferenceIndex, describe, type ReferenceIndex } from './guardian.references.js';
import { aggregate, severityRank } from './guardian.score.js';
import type {
  GuardianContext,
  GuardianEvaluationInput,
  GuardianFindingDraft,
} from './guardian.types.js';

/*
 * GuardianEngine (docs/BRAND-GUARDIAN.md §2). Orden fijo:
 *
 *   recurso → evaluadores deterministas → UNA evaluación semántica estructurada (IA o demo) para
 *   las dimensiones que la piden → validación de referencias y de explicabilidad → score en el
 *   backend → resumen.
 *
 * Lo determinista manda: la IA no puede "perdonar" un hallazgo de reglas (nunca se borra ni se
 * rebaja) y sus propios hallazgos nunca bloquean (son juicio creativo, no hechos). Si la IA falla,
 * la evaluación semántica cae a las reglas demo (mode 'rules') y el informe lo indica.
 */

export interface GuardianOutcome {
  status: GuardianStatus;
  score: number | null;
  dimensions: ReturnType<typeof aggregate>['dimensions'];
  findings: (GuardianFinding & { fix: GuardianFindingDraft['fix'] })[];
  summary: string;
  generation: {
    deterministic: boolean;
    aiUsed: boolean;
    provider: string | null;
    model: string | null;
    mode: 'ai' | 'demo' | 'rules';
  };
}

export interface GuardianEngine {
  evaluate(input: GuardianEvaluationInput): Promise<GuardianOutcome>;
}

/** Traduce los hallazgos de la IA: solo referencias que existen; sin fundamento, se descarta. */
export function validateSemanticFindings(
  raw: GeneratedGuardianEvaluation,
  refs: ReferenceIndex,
  requested: GuardianDimension[],
): GuardianFindingDraft[] {
  const drafts: GuardianFindingDraft[] = [];
  for (const finding of raw.findings) {
    if (!requested.includes(finding.dimension)) continue;
    const evidence = finding.evidenceRefs
      .filter((ref) => ref.startsWith('RESOURCE_'))
      .map((ref) => refs.byRef.get(ref))
      .filter((entry) => entry !== undefined);
    const brand = finding.brandRefs
      .filter((ref) => ref.startsWith('BRAND_') || ref.startsWith('CAMPAIGN_'))
      .filter((ref) => refs.byRef.has(ref));
    // Explicabilidad: un hallazgo relevante debe decir qué parte del ADN o de la campaña contradice.
    if (severityRank(finding.severity) >= severityRank('medium') && brand.length === 0) continue;
    if (finding.severity !== 'info' && evidence.length === 0 && refs.resource.length > 0) continue;
    drafts.push({
      evaluator:
        finding.dimension === 'visual_direction'
          ? 'structured_visual_direction'
          : finding.dimension,
      dimension: finding.dimension,
      // La IA no decide hechos: nunca bloquea ni marca una severidad crítica.
      severity: finding.severity === 'critical' ? 'high' : finding.severity,
      blocking: false,
      code: finding.code,
      title: finding.title,
      message: finding.message,
      evidence: evidence.map((entry) => `${entry.label}: «${entry.text.slice(0, 140)}»`),
      brandRefs: brand,
      recommendation: finding.recommendation,
      canAutoFix: false,
      canOverride: true,
      fix: [],
      source: 'ai',
    });
  }
  return drafts;
}

/**
 * Lo que fundamenta cifras, nombres y promociones: SOLO los textos del ADN y de la estrategia (sin
 * sus números internos: ejes de personalidad, luminancias, versiones) y lo que aportó el usuario.
 * Las fechas tampoco entran: "2026" no fundamenta "2026 clientes".
 */
export function groundingSources(input: GuardianEvaluationInput): unknown[] {
  const dna = input.brandDna;
  const strategy = input.campaignStrategy;
  return [
    input.brandName,
    dna.identity,
    dna.purpose,
    dna.audience,
    dna.personality.traits.map((trait) => trait.label),
    dna.communication.tone,
    dna.communication.vocabulary,
    dna.communication.guidelines,
    dna.visualLanguage.styles,
    dna.visualLanguage.materials,
    dna.visualLanguage.recurringElements,
    dna.visualLanguage.references,
    dna.visualLanguage.palette.map((color) => color.name),
    dna.differentiators,
    dna.creativePreferences,
    dna.restrictions,
    input.campaign?.name ?? null,
    strategy
      ? [
          strategy.concept,
          strategy.bigIdea,
          strategy.keyMessage,
          strategy.supportingMessages,
          strategy.valueProposition,
          strategy.callToAction,
          strategy.campaignNarrative,
          strategy.contentPillars,
          strategy.channels,
        ]
      : null,
    input.userSupplied.map(withoutDates),
  ];
}

/** Una fecha nunca fundamenta una cifra: "2026-10-20" no autoriza "2026 clientes". */
export function withoutDates(text: string): string {
  return text
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+de\s+[a-záéíóú]+(\s+de(l)?\s+\d{4})?\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ');
}

const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);

function summaryOf(
  brand: string,
  status: GuardianStatus,
  findings: GuardianFinding[],
  positives: string[],
): string {
  const top = [...findings]
    .filter(
      (finding) => !finding.overridden && severityRank(finding.severity) >= severityRank('low'),
    )
    .sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        severityRank(b.severity) - severityRank(a.severity),
    )
    .slice(0, 3)
    .map((finding) => lowerFirst(finding.title));
  if (status === 'pass') {
    return `Es coherente con ${brand}${positives[0] ? `: ${lowerFirst(positives[0])}` : '.'}${top.length ? ` Como nota menor: ${top.join('; ')}.` : ''}`.replace(
      /\.\./g,
      '.',
    );
  }
  const issues = top.join('; ');
  return status === 'block'
    ? `Antes de usarlo hay que resolver: ${issues}.`
    : `Puede funcionar para ${brand}, pero conviene ajustar: ${issues}.`;
}

export function createGuardianEngine(deps: { ai: AIProvider; logger: Logger }): GuardianEngine {
  return {
    async evaluate(input) {
      const refs = buildReferenceIndex(
        input.brandDna,
        input.campaignStrategy,
        input.resource.texts,
      );
      const vocabulary = buildVocabulary(groundingSources(input));
      const context: GuardianContext = { input, refs, vocabulary };
      const evaluators = GUARDIAN_EVALUATORS.filter((evaluator) => evaluator.supports(input));
      const applicable = [...new Set(evaluators.map((evaluator) => evaluator.dimension))];

      // 1. Determinista.
      const results = evaluators.map((evaluator) => evaluator.evaluate(context));
      const drafts: GuardianFindingDraft[] = results.flatMap((result) => result.findings);
      const summaries: Partial<Record<GuardianDimension, string | null>> = Object.fromEntries(
        results.map((result) => [result.dimension, result.summary]),
      );

      // 2. Semántica: una sola llamada para todas las dimensiones que la piden.
      const semantic = [...new Set(evaluators.filter((e) => e.semantic).map((e) => e.dimension))];
      let generation: GuardianOutcome['generation'] = {
        deterministic: true,
        aiUsed: false,
        provider: null,
        model: null,
        mode: 'rules',
      };
      if (semantic.length && refs.resource.length) {
        const payload: GuardianPayload = {
          brandName: input.brandName,
          industry: input.brandDna.identity.industry,
          mode: input.mode,
          resourceType: input.resourceType,
          dimensions: semantic,
          profile: brandProfileOf(input.brandDna),
          brand: refs.brand,
          campaign: refs.campaign,
          resource: refs.resource,
        };
        let raw: GeneratedGuardianEvaluation;
        try {
          const result = await deps.ai.generateStructuredOutput({
            system: GUARDIAN_SYSTEM,
            prompt: guardianPrompt(payload),
            schema: GeneratedGuardianEvaluationSchema,
            schemaName: GUARDIAN_EVALUATION_SCHEMA_NAME,
            maxOutputTokens: 4000,
            effort: 'medium',
          });
          raw = GeneratedGuardianEvaluationSchema.parse(result.data);
          generation = {
            deterministic: true,
            aiUsed: result.mode === 'ai',
            provider: result.provider,
            model: result.model,
            mode: result.mode,
          };
        } catch (err) {
          deps.logger.warn('guardian_evaluation_failed', {
            workspaceId: input.workspaceId,
            stage: 'semantic',
            err,
          });
          raw = composeDemoGuardianEvaluation(payload);
        }
        drafts.push(...validateSemanticFindings(raw, refs, semantic));
        for (const entry of raw.dimensions) {
          if (semantic.includes(entry.dimension) && entry.summary && !summaries[entry.dimension]) {
            summaries[entry.dimension] = entry.summary;
          }
        }
      }

      // 3. Hallazgos finales: sin duplicados, con evidencia legible e ids estables.
      const seen = new Set<string>();
      const findings = drafts
        .filter((draft) => {
          const key = `${draft.dimension}:${draft.code}:${draft.message}:${draft.evidence.join('|')}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((draft, index) => ({
          id: `F${index + 1}`,
          evaluator: draft.evaluator,
          dimension: draft.dimension,
          severity: draft.severity,
          blocking: draft.blocking,
          code: draft.code,
          title: draft.title,
          message: draft.message,
          evidence: draft.evidence,
          brandEvidence: [
            ...draft.brandRefs
              .map((ref) => refs.byRef.get(ref))
              .filter((e) => e !== undefined)
              .map(describe),
            ...(draft.brandEvidence ?? []),
          ],
          recommendation: draft.recommendation,
          canAutoFix: draft.canAutoFix,
          canOverride: draft.canOverride,
          overridden: false,
          fix: draft.fix,
        }));

      const { dimensions, score, status } = aggregate(
        applicable,
        [...GUARDIAN_DIMENSIONS],
        findings,
        summaries,
      );
      const positives = dimensions
        .filter((entry) => entry.applicable && entry.status === 'pass' && entry.summary)
        .map((entry) => entry.summary!);
      return {
        status,
        score,
        dimensions,
        findings,
        summary: summaryOf(input.brandName, status, findings, positives),
        generation,
      };
    },
  };
}
