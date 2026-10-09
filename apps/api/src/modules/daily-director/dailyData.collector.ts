import {
  OPEN_TASK_STATUSES,
  type ContentItem,
  type ContentPlan,
  type ContentPlanItem,
  type PersonalDnaContent,
  type Project,
  type Task,
} from '@pixel/contracts';
import type { Types } from 'mongoose';
import { ContentPlanModel, toContentPlanDTO } from '../content-plans/contentPlan.model.js';
import {
  ContentPlanItemModel,
  toContentPlanItemDTO,
} from '../content-plans/contentPlanItem.model.js';
import { ContentItemModel, toContentItemDTO } from '../operations/contentItem.model.js';
import { ProjectModel } from '../operations/project.model.js';
import { toProjectDTOs } from '../operations/projects.service.js';
import { TaskModel, toTaskDTO } from '../operations/task.model.js';
import { loadPersonalDna } from '../personal/personal.service.js';
import { personalDnaContentOf } from '../personal/personalDna.model.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { DailySourceFingerprint } from './dailyBrief.model.js';

/*
 * DailyDataCollector: lee el estado del trabajo de UN workspace con consultas acotadas (nunca
 * colecciones completas). Todo filtra por el workspaceId del workspace autorizado. Solo lee.
 */

export const DAILY_COLLECT_LIMITS = {
  projects: 20,
  datedOpenTasks: 100,
  undatedOpenTasks: 60,
  recentCompleted: 10,
  content: 60,
  scheduledContent: 40,
  plans: 3,
  planItems: 20,
} as const;

export const ACTIVE_CONTENT_STATUSES = [
  'idea',
  'planned',
  'production',
  'review',
  'ready',
] as const;

export interface DailyRawData {
  personalDna: PersonalDnaContent;
  personalDnaVersion: number;
  projects: { project: Project; lastActivityAt: string | null }[];
  openTasks: Task[];
  openTaskTotal: number;
  recentCompleted: Task[];
  content: ContentItem[];
  activeContentTotal: number;
  plans: ContentPlan[];
  planItems: ContentPlanItem[];
  snapshotAt: Date;
  fingerprint: DailySourceFingerprint;
}

async function lastActivityByProject(
  workspace: WorkspaceDocument,
  projectIds: Types.ObjectId[],
): Promise<Map<string, Date>> {
  const latest = new Map<string, Date>();
  if (projectIds.length === 0) return latest;
  const match = { workspaceId: workspace._id, projectId: { $in: projectIds } };
  const group = { $group: { _id: '$projectId', at: { $max: '$updatedAt' } } };
  const [tasks, content] = await Promise.all([
    TaskModel.aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: match }, group]),
    ContentItemModel.aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: match }, group]),
  ]);
  for (const entry of [...tasks, ...content]) {
    const key = entry._id.toString();
    const current = latest.get(key);
    if (!current || entry.at > current) latest.set(key, entry.at);
  }
  return latest;
}

/** null si el workspace no tiene PersonalDNA (el servicio responde 409). */
export async function collectDailyData(
  workspace: WorkspaceDocument,
  now = new Date(),
): Promise<DailyRawData | null> {
  const { profile, personalDna } = await loadPersonalDna(workspace);
  if (!profile || !personalDna) return null;
  const workspaceId = workspace._id;
  const snapshotAt = now;
  const open = { workspaceId, status: { $in: [...OPEN_TASK_STATUSES] } };
  const activeContent = { workspaceId, status: { $in: [...ACTIVE_CONTENT_STATUSES] } };
  const limits = DAILY_COLLECT_LIMITS;

  const [
    projectDocs,
    datedTasks,
    undatedTasks,
    openTaskTotal,
    completed,
    recentContent,
    scheduledContent,
    activeContentTotal,
    planDocs,
  ] = await Promise.all([
    ProjectModel.find({ workspaceId, status: { $in: ['active', 'planned'] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limits.projects),
    TaskModel.find({ ...open, dueDate: { $ne: null } })
      .sort({ dueDate: 1, _id: 1 })
      .limit(limits.datedOpenTasks),
    TaskModel.find({ ...open, dueDate: null })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limits.undatedOpenTasks),
    TaskModel.countDocuments(open),
    TaskModel.find({
      workspaceId,
      status: 'done',
      completedAt: { $gte: new Date(now.getTime() - 7 * 86_400_000) },
    })
      .sort({ completedAt: -1 })
      .limit(limits.recentCompleted),
    ContentItemModel.find(activeContent).sort({ updatedAt: -1, _id: -1 }).limit(limits.content),
    ContentItemModel.find({ ...activeContent, scheduledFor: { $ne: null } })
      .sort({ scheduledFor: 1, _id: 1 })
      .limit(limits.scheduledContent),
    ContentItemModel.countDocuments(activeContent),
    ContentPlanModel.find({ workspaceId, status: { $in: ['draft', 'active'] } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limits.plans),
  ]);

  const planItemDocs = planDocs.length
    ? await ContentPlanItemModel.find({
        workspaceId,
        contentPlanId: { $in: planDocs.map((plan) => plan._id) },
        status: 'proposed',
      })
        .sort({ scheduledFor: 1, _id: 1 })
        .limit(limits.planItems)
    : [];

  const activity = await lastActivityByProject(
    workspace,
    projectDocs.map((project) => project._id),
  );
  const projects = (await toProjectDTOs(workspace, projectDocs)).map((project) => ({
    project,
    lastActivityAt: activity.get(project.id)?.toISOString() ?? null,
  }));

  const contentById = new Map(
    [...scheduledContent, ...recentContent].map((doc) => [doc.id as string, doc] as const),
  );

  return {
    personalDna: personalDnaContentOf(personalDna),
    personalDnaVersion: personalDna.version,
    projects,
    openTasks: [...datedTasks, ...undatedTasks].map(toTaskDTO),
    openTaskTotal,
    recentCompleted: completed.map(toTaskDTO),
    content: [...contentById.values()].map(toContentItemDTO),
    activeContentTotal,
    plans: planDocs.map((plan) => toContentPlanDTO(plan)),
    planItems: planItemDocs.map(toContentPlanItemDTO),
    snapshotAt,
    fingerprint: { openTasks: openTaskTotal, activeContent: activeContentTotal },
  };
}
