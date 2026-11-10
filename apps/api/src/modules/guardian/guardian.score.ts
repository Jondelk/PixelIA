import type {
  GuardianDimension,
  GuardianDimensionResult,
  GuardianFinding,
  GuardianSeverity,
  GuardianStatus,
} from '@pixel/contracts';

/*
 * GuardianScoreAggregator (docs/BRAND-GUARDIAN.md §6). El score NO lo da la IA: lo calcula el
 * backend a partir de los hallazgos, siempre igual para los mismos hallazgos.
 *
 * - Cada dimensión aplicable empieza en 100 y resta por hallazgo: info 0 · leve 5 · media 12 ·
 *   alta 25 · crítica 40 (mínimo 0). Un hallazgo que el usuario decidió pasar por alto sigue
 *   restando: el override cambia la decisión, no los hechos.
 * - Estado de la dimensión: BLOCK si tiene un hallazgo bloqueante no superado; WARNING si tiene
 *   alguno de severidad media o más; si no, PASS (las notas leves no bastan para advertir).
 * - Score global: media ponderada de las dimensiones APLICABLES (un evaluador que no aplica no
 *   penaliza). Pesos simples: identidad, comunicación y estrategia 3; afirmaciones, restricciones,
 *   campaña y dirección visual 2; contenido 1.
 * - Es una heurística explicable, no una medida científica de coherencia.
 */

export const SEVERITY_PENALTY: Record<GuardianSeverity, number> = {
  info: 0,
  low: 5,
  medium: 12,
  high: 25,
  critical: 40,
};

export const DIMENSION_WEIGHT: Record<GuardianDimension, number> = {
  identity: 3,
  communication: 3,
  strategy: 3,
  claims: 2,
  restrictions: 2,
  campaign_alignment: 2,
  visual_direction: 2,
  content: 1,
};

const RANK: Record<GuardianSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function dimensionStatus(findings: GuardianFinding[]): GuardianStatus {
  if (findings.some((finding) => finding.blocking && !finding.overridden)) return 'block';
  if (findings.some((finding) => RANK[finding.severity] >= RANK.medium && !finding.overridden)) {
    return 'warning';
  }
  return 'pass';
}

export function dimensionScore(findings: GuardianFinding[]): number {
  return Math.max(
    0,
    100 - findings.reduce((total, finding) => total + SEVERITY_PENALTY[finding.severity], 0),
  );
}

export function aggregate(
  applicable: GuardianDimension[],
  all: GuardianDimension[],
  findings: GuardianFinding[],
  summaries: Partial<Record<GuardianDimension, string | null>>,
): { dimensions: GuardianDimensionResult[]; score: number | null; status: GuardianStatus } {
  const dimensions = all.map((dimension): GuardianDimensionResult => {
    const own = findings.filter((finding) => finding.dimension === dimension);
    const isApplicable = applicable.includes(dimension);
    return {
      dimension,
      applicable: isApplicable,
      score: isApplicable ? dimensionScore(own) : null,
      status: isApplicable ? dimensionStatus(own) : 'pass',
      summary: isApplicable ? (summaries[dimension] ?? null) : null,
      findingIds: own.map((finding) => finding.id),
    };
  });
  const scored = dimensions.filter((entry) => entry.applicable && entry.score !== null);
  const weight = scored.reduce((total, entry) => total + DIMENSION_WEIGHT[entry.dimension], 0);
  const score = weight
    ? Math.round(
        scored.reduce(
          (total, entry) => total + entry.score! * DIMENSION_WEIGHT[entry.dimension],
          0,
        ) / weight,
      )
    : null;
  const status: GuardianStatus = dimensions.some((entry) => entry.status === 'block')
    ? 'block'
    : dimensions.some((entry) => entry.status === 'warning')
      ? 'warning'
      : 'pass';
  return { dimensions, score, status };
}

export const severityRank = (severity: GuardianSeverity) => RANK[severity];
