import {
  CONTENT_PIPELINE,
  OPEN_TASK_STATUSES,
  OPERATIONS_SUMMARY_LIST_SIZE,
  type OperationsSummary,
} from '@pixel/contracts';
import type { OperationsStatusContext } from '../../ai/operationsStatusContext.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { ContentItemModel, toContentItemDTO } from './contentItem.model.js';
import { localDayBounds, timezoneOffsetMinutes } from './operations.scope.js';
import { ProjectModel } from './project.model.js';
import { toProjectDTOs } from './projects.service.js';
import { TaskModel, toTaskDTO } from './task.model.js';

/*
 * Resumen operacional del workspace (Personal o Enterprise): conteos y listas cortas de datos
 * REALES, sin IA ni recomendaciones. Dos lecturas sobre los mismos conteos:
 * - getOperationsSummary: Inicio (Personal y Enterprise), con el día local del navegador.
 * - getOperationsStatus: contexto del chat Enterprise, SOLO conteos, con la zona del workspace.
 */

const UNPUBLISHED = CONTENT_PIPELINE.filter((status) => status !== 'published');

/** Conteos del workspace; `start` = inicio del día local (lo anterior está vencido). */
async function operationsCounts(workspace: WorkspaceDocument, start: Date) {
  const workspaceId = workspace._id;
  const openTasks = { workspaceId, status: { $in: [...OPEN_TASK_STATUSES] } };
  const [activeProjects, openTaskCount, overdueTasks, contentInProduction, activeContentItems] =
    await Promise.all([
      ProjectModel.countDocuments({ workspaceId, status: 'active' }),
      TaskModel.countDocuments(openTasks),
      TaskModel.countDocuments({ ...openTasks, dueDate: { $lt: start } }),
      ContentItemModel.countDocuments({ workspaceId, status: 'production' }),
      ContentItemModel.countDocuments({ workspaceId, status: { $in: UNPUBLISHED } }),
    ]);
  return {
    activeProjects,
    openTasks: openTaskCount,
    overdueTasks,
    contentInProduction,
    activeContentItems,
  };
}

export async function getOperationsSummary(
  workspace: WorkspaceDocument,
  { tzOffset, now = new Date() }: { tzOffset: number; now?: Date },
): Promise<OperationsSummary> {
  const workspaceId = workspace._id;
  const { start } = localDayBounds(now, tzOffset);
  const size = OPERATIONS_SUMMARY_LIST_SIZE;

  const [counts, upcomingTasks, recentProjects, upcomingContent] = await Promise.all([
    operationsCounts(workspace, start),
    TaskModel.find({
      workspaceId,
      status: { $in: [...OPEN_TASK_STATUSES] },
      dueDate: { $gte: start },
    })
      .sort({ dueDate: 1, _id: 1 })
      .limit(size),
    ProjectModel.find({ workspaceId, status: { $ne: 'archived' } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(size),
    ContentItemModel.find({
      workspaceId,
      status: { $in: UNPUBLISHED },
      scheduledFor: { $gte: start },
    })
      .sort({ scheduledFor: 1, _id: 1 })
      .limit(size),
  ]);

  return {
    counts,
    upcomingTasks: upcomingTasks.map(toTaskDTO),
    recentProjects: await toProjectDTOs(workspace, recentProjects),
    upcomingContent: upcomingContent.map(toContentItemDTO),
  };
}

/** Estado operativo compacto (solo conteos) para el contexto del chat. Sin IA. */
export async function getOperationsStatus(
  workspace: WorkspaceDocument,
  { timezone, now = new Date() }: { timezone: string; now?: Date },
): Promise<OperationsStatusContext> {
  const { start } = localDayBounds(now, timezoneOffsetMinutes(now, timezone));
  const counts = await operationsCounts(workspace, start);
  return {
    activeProjects: counts.activeProjects,
    openTasks: counts.openTasks,
    overdueTasks: counts.overdueTasks,
    activeContentItems: counts.activeContentItems,
  };
}
