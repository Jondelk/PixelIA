import type { Project } from '@pixel/contracts';
import { daysUntil, relativeDay, type DayContext } from './dailyTime.js';

/*
 * ProjectHealth: señales simples y legibles, sin analítica.
 * - at_risk: venció con tareas abiertas · vence en ≤ 1 día con ≥ 2 abiertas · vence en ≤ 3 días
 *   con ≥ 4 abiertas.
 * - attention: vence en ≤ 3 días con alguna abierta · vence en ≤ 7 días con ≥ 5 abiertas ·
 *   activo sin actividad en ≥ 14 días (estancado).
 * - healthy: lo demás. Sin fecha límite no se infiere ningún riesgo de plazo.
 */

export type ProjectHealthStatus = 'healthy' | 'attention' | 'at_risk';

export const STALLED_AFTER_DAYS = 14;

export interface ProjectHealth {
  status: ProjectHealthStatus;
  openTasks: number;
  daysLeft: number | null;
  stalledDays: number | null;
  /** Frases de hechos (para el contexto de la IA y el fallback). */
  reasons: string[];
}

export function projectHealth(
  project: Project,
  lastActivityAt: string | null,
  day: DayContext,
  now: Date,
): ProjectHealth {
  const openTasks = Math.max(0, project.stats.tasks - project.stats.completedTasks);
  const daysLeft = daysUntil(project.dueDate, day);
  const lastActivity = Date.parse(lastActivityAt ?? project.updatedAt);
  const idleDays = Math.floor((now.getTime() - lastActivity) / 86_400_000);
  const stalledDays =
    project.status === 'active' && idleDays >= STALLED_AFTER_DAYS ? idleDays : null;
  const reasons: string[] = [];
  let status: ProjectHealthStatus = 'healthy';

  if (project.status !== 'active' && project.status !== 'planned') {
    return { status, openTasks, daysLeft, stalledDays: null, reasons };
  }

  if (daysLeft !== null && openTasks > 0) {
    const tasks = `${openTasks} ${openTasks === 1 ? 'tarea abierta' : 'tareas abiertas'}`;
    if (daysLeft < 0 || (daysLeft <= 1 && openTasks >= 2) || (daysLeft <= 3 && openTasks >= 4)) {
      status = 'at_risk';
    } else if (daysLeft <= 3 || (daysLeft <= 7 && openTasks >= 5)) {
      status = 'attention';
    }
    if (status !== 'healthy') {
      reasons.push(
        daysLeft < 0
          ? `Venció ${relativeDay(daysLeft)} y tiene ${tasks}`
          : `Vence ${relativeDay(daysLeft)} y tiene ${tasks}`,
      );
    }
  }
  if (stalledDays !== null) {
    if (status === 'healthy') status = 'attention';
    reasons.push(`Sin actividad desde hace ${stalledDays} días`);
  }
  return { status, openTasks, daysLeft, stalledDays, reasons };
}
