import { localDateIn, OPEN_TASK_STATUSES, type DailyBrief } from '@pixel/contracts';
import { ContentPlanItemModel } from '../content-plans/contentPlanItem.model.js';
import { ContentItemModel } from '../operations/contentItem.model.js';
import { ProjectModel } from '../operations/project.model.js';
import { TaskModel } from '../operations/task.model.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { hasWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { DailyBriefModel, toDailyBriefDTO, type DailyBriefDocument } from './dailyBrief.model.js';
import { ACTIVE_CONTENT_STATUSES } from './dailyData.collector.js';
import { workspaceTimezone } from './dailyTime.js';

/*
 * Lectura del brief vigente y detección de cambios (stale). Sin dependencias del chat, para que
 * el PersonalContextBuilder pueda usarlo sin ciclos.
 */

export async function currentBriefDoc(
  workspace: WorkspaceDocument,
  localDate: string,
): Promise<DailyBriefDocument | null> {
  return DailyBriefModel.findOne({ workspaceId: workspace._id, localDate }).sort({ version: -1 });
}

/**
 * Stale = hubo cambios relevantes desde que se leyó el estado: alguna tarea, proyecto, contenido
 * o propuesta con `updatedAt` posterior a `contextSnapshotAt`, o un conteo distinto (borrados).
 * No regenera nada: solo lo indica.
 */
export async function isBriefStale(
  workspace: WorkspaceDocument,
  brief: DailyBriefDocument,
): Promise<boolean> {
  const workspaceId = workspace._id;
  const changed = { workspaceId, updatedAt: { $gt: brief.contextSnapshotAt } };
  const [task, project, content, planItem, openTasks, activeContent] = await Promise.all([
    TaskModel.exists(changed),
    ProjectModel.exists(changed),
    ContentItemModel.exists(changed),
    ContentPlanItemModel.exists(changed),
    TaskModel.countDocuments({ workspaceId, status: { $in: [...OPEN_TASK_STATUSES] } }),
    ContentItemModel.countDocuments({ workspaceId, status: { $in: [...ACTIVE_CONTENT_STATUSES] } }),
  ]);
  return Boolean(
    task ||
    project ||
    content ||
    planItem ||
    openTasks !== brief.fingerprint.openTasks ||
    activeContent !== brief.fingerprint.activeContent,
  );
}

/** Para el chat: la dirección vigente de HOY (o null) y si quedó desactualizada. */
export async function currentBriefForContext(
  workspace: WorkspaceDocument,
  defaultTimezone: string,
  now = new Date(),
): Promise<{ brief: DailyBrief; stale: boolean } | null> {
  if (!hasWorkspaceFeature(workspace, 'dailyDirector')) return null;
  const localDate = localDateIn(now, workspaceTimezone(workspace, defaultTimezone));
  const doc = await currentBriefDoc(workspace, localDate);
  return doc ? { brief: toDailyBriefDTO(doc), stale: await isBriefStale(workspace, doc) } : null;
}
