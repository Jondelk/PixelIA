import type {
  ContentItem,
  ContentPlanItem,
  DailyFacts,
  DailyResourceType,
  DailyUrgency,
  DailyWarning,
  PersonalDnaContent,
  Project,
  Task,
} from '@pixel/contracts';
import { contentHealth, contentRelevant, type ContentHealth } from './contentHealth.js';
import type { DailyRawData } from './dailyData.collector.js';
import { dayContext, relativeDay, type DayContext } from './dailyTime.js';
import {
  byScore,
  scoreContent,
  scorePlanItem,
  scoreTask,
  urgencyOf,
  type Scored,
  type Signal,
} from './priorityScorer.js';
import { projectHealth, type ProjectHealth } from './projectHealth.js';

/*
 * Análisis determinístico del día: el backend controla los HECHOS (puntuaciones, salud, avisos,
 * conteos) y asigna referencias controladas (TASK_1, PROJECT_1, CONTENT_1, PLANITEM_1). La IA solo
 * interpreta estos datos; el fallback los usa directamente.
 */

/** Cuántos elementos de cada tipo ve la IA (los mejor puntuados). */
export const DAILY_CONTEXT_LIMITS = { tasks: 12, projects: 6, content: 6, planItems: 5 } as const;

export type FocusMode = 'deep' | 'balanced' | 'short';
export const FOCUS_BLOCKS_BY_MODE: Record<FocusMode, number> = { deep: 2, balanced: 3, short: 4 };

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Forma de trabajar declarada en el ADN → cuántos bloques de enfoque tiene sentido proponer. */
export function focusModeOf(dna: PersonalDnaContent): FocusMode {
  const text = normalize(
    [
      ...dna.workStyle.focusStyle,
      ...dna.workStyle.executionStyle,
      ...dna.workStyle.planningStyle,
      ...dna.workStyle.productivityPreferences,
    ].join(' '),
  );
  if (
    /profund|una cosa a la vez|pocas tareas|bloques largos|deep work|sin interrupciones/.test(text)
  ) {
    return 'deep';
  }
  if (/sprints? cort|sesiones cortas|bloques cortos|pomodoro|ratos cortos|short/.test(text)) {
    return 'short';
  }
  return 'balanced';
}

/** Áreas de ayuda declaradas (supportNeeds.wantsHelpWith). */
export function helpAreasOf(dna: PersonalDnaContent) {
  const text = normalize(dna.supportNeeds.wantsHelpWith.join(' '));
  return {
    content: contentRelevant(dna),
    projects: /proyecto/.test(text),
    organization: /organiza|planifica|prioriza|productividad|tiempo|foco/.test(text),
  };
}

export interface RefTarget {
  ref: string;
  type: DailyResourceType;
  id: string;
  title: string;
  score: number;
  urgency: DailyUrgency;
  signals: Signal[];
  estimatedMinutes: number | null;
  /** Para el contenido: estado y formato (acción sugerida); para propuestas: su plan. */
  contentStatus?: ContentItem['status'];
  format?: string | null;
  contentPlanId?: string;
  projectId?: string | null;
  /** Elegible como prioridad del día (el contenido solo si es relevante o urgente). */
  priorityEligible: boolean;
}

export interface DailyAnalysis {
  day: DayContext;
  now: Date;
  dna: PersonalDnaContent;
  personalDnaVersion: number;
  focusMode: FocusMode;
  maxFocusBlocks: number;
  helpAreas: ReturnType<typeof helpAreasOf>;
  projects: { project: Project; health: ProjectHealth }[];
  tasks: Scored<Task>[];
  content: Scored<ContentItem>[];
  planItems: (Scored<ContentPlanItem> & { planName: string })[];
  contentHealth: ContentHealth;
  /** Hay contenido urgente (vencido o para hoy/mañana) aunque el contenido no sea un área de ayuda. */
  urgentContent: boolean;
  warnings: DailyWarning[];
  facts: DailyFacts;
  /** Candidatos a prioridad, de mayor a menor puntuación. */
  candidates: RefTarget[];
  /** Todas las referencias que la IA puede usar. */
  refs: Map<string, RefTarget>;
  recentCompleted: string[];
  hasWork: boolean;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function buildWarnings(
  analysis: Omit<DailyAnalysis, 'warnings' | 'candidates' | 'refs'>,
): DailyWarning[] {
  const warnings: DailyWarning[] = [];
  const overdue = analysis.tasks.filter((entry) => (entry.daysUntil ?? 0) < 0);
  if (overdue.length === 1) {
    warnings.push({
      type: 'overdue',
      message: `Tienes una tarea vencida: «${overdue[0]!.item.title}».`,
      relatedResourceIds: [overdue[0]!.item.id],
    });
  } else if (overdue.length > 1) {
    warnings.push({
      type: 'overdue',
      message: `Tienes ${overdue.length} tareas vencidas. No empezaría nada nuevo antes de cerrar al menos una.`,
      relatedResourceIds: overdue.slice(0, 10).map((entry) => entry.item.id),
    });
  }
  for (const { project, health } of analysis.projects
    .filter((entry) => entry.health.status === 'at_risk' && entry.health.daysLeft !== null)
    .slice(0, 2)) {
    const days = health.daysLeft!;
    warnings.push({
      type: 'deadline',
      message: `«${project.name}» ${days < 0 ? `venció ${relativeDay(days)}` : `vence ${relativeDay(days)}`} y todavía tiene ${health.openTasks} ${plural(health.openTasks, 'tarea abierta', 'tareas abiertas')}.`,
      relatedResourceIds: [project.id],
    });
  }
  for (const item of analysis.contentHealth.overdue.slice(0, 2)) {
    const entry = analysis.content.find((scored) => scored.item.id === item.id);
    warnings.push({
      type: 'deadline',
      message: `«${item.title}» estaba prevista para ${relativeDay(entry?.daysUntil ?? -1)} y aún no está publicada.`,
      relatedResourceIds: [item.id],
    });
  }
  for (const { project, health } of analysis.projects
    .filter((entry) => entry.health.stalledDays !== null)
    .slice(0, 2)) {
    warnings.push({
      type: 'stalled_project',
      message: `«${project.name}» no tiene actividad desde hace ${health.stalledDays} días.`,
      relatedResourceIds: [project.id],
    });
  }
  if (analysis.facts.openTasks > 12 || analysis.facts.dueToday >= 6) {
    warnings.push({
      type: 'overload',
      message: `Tienes ${analysis.facts.openTasks} tareas abiertas: hoy no intentaría resolverlas todas.`,
      relatedResourceIds: [],
    });
  }
  if (analysis.contentHealth.noPlannedContent && analysis.helpAreas.content) {
    warnings.push({
      type: 'content_gap',
      message: 'No tienes contenido previsto ni en marcha para los próximos 7 días.',
      relatedResourceIds: [],
    });
  }
  return warnings;
}

export function analyzeDay(raw: DailyRawData, timezone: string, now = new Date()): DailyAnalysis {
  const day = dayContext(now, timezone);
  const projects = raw.projects.map(({ project, lastActivityAt }) => ({
    project,
    health: projectHealth(project, lastActivityAt, day, now),
  }));
  const projectInfo = new Map(
    projects.map(({ project, health }) => [project.id, { name: project.name, health }] as const),
  );
  const tasks = byScore(raw.openTasks.map((task) => scoreTask(task, day, projectInfo)));
  const content = byScore(raw.content.map((item) => scoreContent(item, day, projectInfo)));
  const planNames = new Map(raw.plans.map((plan) => [plan.id, plan.name] as const));
  const planItems = byScore(raw.planItems.map((item) => scorePlanItem(item, day))).map((entry) => ({
    ...entry,
    planName: planNames.get(entry.item.contentPlanId) ?? '',
  }));
  const health = contentHealth(raw.content, raw.planItems, day);
  const helpAreas = helpAreasOf(raw.personalDna);
  const focusMode = focusModeOf(raw.personalDna);
  const urgentContent = content.some((entry) => entry.daysUntil !== null && entry.daysUntil <= 1);

  const facts: DailyFacts = {
    openTasks: raw.openTaskTotal,
    overdueTasks: tasks.filter((entry) => (entry.daysUntil ?? 0) < 0).length,
    dueToday: tasks.filter((entry) => entry.daysUntil === 0).length,
    dueTomorrow: tasks.filter((entry) => entry.daysUntil === 1).length,
    activeProjects: projects.filter((entry) => entry.project.status === 'active').length,
    activeContent: raw.activeContentTotal,
  };

  const base = {
    day,
    now,
    dna: raw.personalDna,
    personalDnaVersion: raw.personalDnaVersion,
    focusMode,
    maxFocusBlocks: FOCUS_BLOCKS_BY_MODE[focusMode],
    helpAreas,
    projects,
    tasks,
    content,
    planItems,
    contentHealth: health,
    urgentContent,
    facts,
    recentCompleted: raw.recentCompleted.slice(0, 5).map((task) => task.title),
    hasWork:
      raw.openTasks.length > 0 ||
      raw.content.length > 0 ||
      raw.projects.length > 0 ||
      raw.planItems.length > 0,
  };
  const warnings = buildWarnings(base);

  // Referencias controladas: solo lo mejor puntuado entra al contexto de la IA.
  const refs = new Map<string, RefTarget>();
  const add = (target: Omit<RefTarget, 'ref'>, prefix: string, index: number) => {
    const ref = `${prefix}_${index + 1}`;
    refs.set(ref, { ...target, ref });
    return refs.get(ref)!;
  };
  const taskRefs = tasks.slice(0, DAILY_CONTEXT_LIMITS.tasks).map((entry, index) =>
    add(
      {
        type: 'task',
        id: entry.item.id,
        title: entry.item.title,
        score: entry.score,
        urgency: entry.urgency,
        signals: entry.signals,
        estimatedMinutes: entry.item.estimatedMinutes,
        projectId: entry.item.projectId,
        priorityEligible: true,
      },
      'TASK',
      index,
    ),
  );
  const projectEntries = [...projects]
    .sort((a, b) => rankHealth(b.health) - rankHealth(a.health))
    .slice(0, DAILY_CONTEXT_LIMITS.projects);
  const projectRefs = projectEntries.map(({ project, health }, index) => {
    const score = health.status === 'at_risk' ? 45 : health.status === 'attention' ? 25 : 5;
    return add(
      {
        type: 'project',
        id: project.id,
        title: project.name,
        score,
        urgency: urgencyOf(score),
        signals: health.reasons.map((text) => ({
          code: `project_${health.status}`,
          points: 0,
          text,
        })),
        estimatedMinutes: null,
        priorityEligible: health.status !== 'healthy',
      },
      'PROJECT',
      index,
    );
  });
  const contentEligible = helpAreas.content;
  const contentRefs = content.slice(0, DAILY_CONTEXT_LIMITS.content).map((entry, index) =>
    add(
      {
        type: 'content',
        id: entry.item.id,
        title: entry.item.title,
        score: entry.score,
        urgency: entry.urgency,
        signals: entry.signals,
        estimatedMinutes: null,
        contentStatus: entry.item.status,
        format: entry.item.format,
        projectId: entry.item.projectId,
        priorityEligible:
          (contentEligible || (entry.daysUntil !== null && entry.daysUntil <= 1)) &&
          entry.score >= 10,
      },
      'CONTENT',
      index,
    ),
  );
  planItems.slice(0, DAILY_CONTEXT_LIMITS.planItems).forEach((entry, index) =>
    add(
      {
        type: 'plan_item',
        id: entry.item.id,
        title: entry.item.title,
        score: entry.score,
        urgency: entry.urgency,
        signals: entry.signals,
        estimatedMinutes: null,
        format: entry.item.format,
        contentPlanId: entry.item.contentPlanId,
        projectId: entry.item.projectId,
        priorityEligible: false,
      },
      'PLANITEM',
      index,
    ),
  );

  const candidates = [...taskRefs, ...projectRefs, ...contentRefs]
    .filter((target) => target.priorityEligible)
    // Un proyecto en riesgo cuya tarea más urgente ya es candidata no se duplica como prioridad.
    .filter(
      (target) =>
        target.type !== 'project' ||
        !taskRefs.slice(0, 3).some((task) => task.projectId === target.id),
    )
    .sort((a, b) => b.score - a.score);

  return { ...base, warnings, candidates, refs };
}

function rankHealth(health: ProjectHealth): number {
  return health.status === 'at_risk' ? 2 : health.status === 'attention' ? 1 : 0;
}
