import type {
  GuardianFinding,
  GuardianPreflightSummary,
  GuardianReport,
  GuardianSeverity,
  GuardianStatus,
} from '@pixel/contracts';

/*
 * Lógica pura de la UI del Brand Guardian: orden de los hallazgos, textos de estado y qué acciones
 * ofrece cada informe. El score siempre se muestra junto a estado, dimensiones y hallazgos.
 */

const RANK: Record<GuardianSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Primero lo que bloquea, después por severidad. */
export function sortFindings<
  T extends Pick<GuardianFinding, 'blocking' | 'severity' | 'overridden'>,
>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      Number(a.overridden) - Number(b.overridden) ||
      Number(b.blocking) - Number(a.blocking) ||
      RANK[b.severity] - RANK[a.severity],
  );
}

export const STATUS_HEADLINE: Record<GuardianStatus, string> = {
  pass: 'Coherente con la marca',
  warning: 'Con ajustes recomendados',
  block: 'Resolver antes de continuar',
};

/** Línea compacta del preflight: "✓ Coherencia de marca", "⚠ 1 ajuste recomendado"… */
export function preflightHeadline(status: GuardianStatus, open: number, blocking = open): string {
  if (status === 'pass')
    return open
      ? `Coherente con la marca · ${open} ${open === 1 ? 'nota' : 'notas'}`
      : 'Coherente con la marca';
  if (status === 'block') {
    const rest = open - blocking;
    return `Guardian encontró ${blocking === 1 ? '1 cosa' : `${blocking} cosas`} que resolver antes de organizar${rest > 0 ? ` · ${rest} ${rest === 1 ? 'recomendación' : 'recomendaciones'}` : ''}`;
  }
  return `${open} ${open === 1 ? 'ajuste recomendado' : 'ajustes recomendados'}`;
}

/** ¿Se puede "Corregir con Pixel"? Solo con hallazgos corregibles y si no es ya una corrección. */
export const canCorrect = (report: GuardianReport) =>
  !report.correction &&
  report.findings.some((finding) => finding.canAutoFix && !finding.overridden);

/** ¿La corrección se puede aplicar al recurso (contenido y piezas del plan)? */
export const canApply = (report: GuardianReport) =>
  report.correction !== null &&
  report.correction.appliedAt === null &&
  !report.stale &&
  ['content_item', 'content_plan_item', 'content_plan'].includes(report.resourceType);

/** Hallazgos abiertos (no superados) que importan en la línea compacta. */
export const openFindings = <T extends Pick<GuardianFinding, 'overridden' | 'severity'>>(
  findings: T[],
) => findings.filter((finding) => !finding.overridden && RANK[finding.severity] >= RANK.low);

/** ¿Se puede continuar de todas formas? Solo si todo lo que bloquea lo admite. */
export const preflightOverridable = (guardian: GuardianPreflightSummary) =>
  guardian.status === 'block' &&
  !guardian.overridden &&
  guardian.findings
    .filter((finding) => finding.blocking && !finding.overridden)
    .every((finding) => finding.canOverride);

export const preflightBlocks = (guardian: GuardianPreflightSummary | null) =>
  guardian !== null && guardian.status === 'block' && !guardian.overridden;

/** Prompt 17: tras una revisión, «listo» si pasa y «requiere tu atención» si no (sobrio, sin alarmas). */
export const presenceAfterReview = (status: 'pass' | 'warning' | 'block'): 'success' | 'warn' =>
  status === 'pass' ? 'success' : 'warn';
