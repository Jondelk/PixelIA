import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLAN_DEFAULT_FREQUENCY,
  CONTENT_PLAN_MAX_DAYS,
  CONTENT_PLAN_MAX_FREQUENCY,
  CONTENT_PLATFORM_LABELS,
  type ContentFormat,
  type ContentPlatform,
  type PixelActionStepType,
  type PixelCommandEntities,
  type PixelCommandIntent,
  type PixelTimeframe,
} from '@pixel/contracts';
import { asksNewProject, fold } from '../../ai/index.js';
import { platformFromText } from '../content-plans/contentPlanning.grounding.js';
import type { KnownCampaign, KnownProject, PixelKnownContext } from './pixelContext.resolver.js';

/*
 * MissingInformationResolver + ActionPlan (docs/PIXEL-COMMAND.md §4–§5). Funciones puras: reciben
 * lo que el usuario dijo (entidades) y lo que Pixel ya sabe (contexto) y deciden:
 *   - si falta algo que cambia MATERIALMENTE el resultado → UNA pregunta;
 *   - si no → una propuesta en lenguaje humano con sus pasos (servicios existentes).
 * Nunca se pregunta lo que ya vive en el ADN (tono, colores, audiencia, personalidad) y se prefieren
 * los valores del contexto: los canales de la campaña, las plataformas del PersonalDNA, una
 * frecuencia razonable.
 */

export interface StepDraft {
  id: string;
  type: PixelActionStepType;
  title: string;
  params: Record<string, unknown>;
}

export interface PlanningState {
  intent: PixelCommandIntent;
  request: string;
  entities: PixelCommandEntities;
  context: PixelKnownContext;
  /** Día local de hoy del workspace (AAAA-MM-DD). */
  today: string;
  tzOffset: number;
  /** Campaña ya elegida (pantalla o respuesta), siempre de este workspace. */
  chosenCampaignId: string | null;
  noCampaign: boolean;
  /** Prompt 17: proyecto que el usuario está viendo (validado contra el workspace). */
  chosenProject?: KnownProject | null;
}

export type PlanningOutcome =
  | { kind: 'question'; field: string; question: string }
  | {
      kind: 'proposal';
      summary: string;
      understood: string[];
      proposal: string[];
      creates: string[];
      steps: StepDraft[];
      campaignId: string | null;
    }
  | { kind: 'reply' };

/* ---------- Fechas ---------- */

const DAY_MS = 86_400_000;
const toTime = (day: string) => Date.parse(`${day}T12:00:00.000Z`);
export const addDays = (day: string, days: number) =>
  new Date(toTime(day) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(toTime(day)).getUTCDay(); // 0 = domingo
const nextMonday = (day: string) => addDays(day, (8 - weekday(day)) % 7 || 7);

export interface Period {
  startDate: string;
  endDate: string;
  days: number;
}

const periodOf = (startDate: string, endDate: string): Period => ({
  startDate,
  endDate,
  days: Math.round((toTime(endDate) - toTime(startDate)) / DAY_MS) + 1,
});

/** Periodo de un plazo, en días locales del workspace. Sin plazo: los próximos 7 días. */
export function periodFor(timeframe: PixelTimeframe | null, today: string): Period {
  switch (timeframe) {
    case 'today':
      return periodOf(today, today);
    case 'this_week': {
      const sunday = addDays(today, (7 - weekday(today)) % 7);
      return periodOf(today, sunday);
    }
    case 'next_week': {
      const monday = nextMonday(today);
      return periodOf(monday, addDays(monday, 6));
    }
    case 'next_two_weeks': {
      const monday = nextMonday(today);
      return periodOf(monday, addDays(monday, 13));
    }
    case 'this_month': {
      const [year, month] = today.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return periodOf(today, last);
    }
    case 'next_month': {
      const [year, month] = today.split('-').map(Number) as [number, number];
      const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
      const end = periodOf(first, last).days > CONTENT_PLAN_MAX_DAYS ? addDays(first, 29) : last;
      return periodOf(first, end);
    }
    default:
      return periodOf(addDays(today, 1), addDays(today, 7));
  }
}

const dayFormat = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
export function periodLabel(period: Period): string {
  const start = dayFormat.format(new Date(toTime(period.startDate)));
  const end = dayFormat.format(new Date(toTime(period.endDate)));
  return period.days === 1 ? start : `${start} – ${end}`;
}

const TIMEFRAME_LABELS: Record<PixelTimeframe, string> = {
  today: 'hoy',
  this_week: 'esta semana',
  next_week: 'la próxima semana',
  next_two_weeks: 'las próximas dos semanas',
  this_month: 'este mes',
  next_month: 'el próximo mes',
};

/* ---------- Coincidencias con recursos del workspace ---------- */

const STOP = new Set(
  'de del la las el los para con por una uno unos unas que campana campanas contenido contenidos necesito quiero semana esta este proxima proximo instagram tiktok publicar sobre hacer haz usando nuevo nueva nuestro nuestra mes hoy plan piezas'.split(
    ' ',
  ),
);
const keyWords = (text: string) =>
  (fold(text).match(/[a-z0-9ñ]+/g) ?? []).filter(
    (word) => (word.length >= 3 || /\d/.test(word)) && !STOP.has(word),
  );

function overlap(a: string, b: string): number {
  const words = new Set(keyWords(b));
  return new Set(keyWords(a).filter((word) => words.has(word))).size;
}

/** Campañas que encajan con una pista (o con la solicitud completa, más exigente). */
export function matchCampaigns(
  campaigns: KnownCampaign[],
  hint: string | null,
  request: string,
): KnownCampaign[] {
  const source = hint ?? request;
  const minimum = hint ? 1 : 2;
  const scored = campaigns
    .map((campaign) => ({
      campaign,
      score: overlap(source, `${campaign.name} ${campaign.productOrService ?? ''}`),
    }))
    .filter((entry) => entry.score >= minimum);
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === best).map((entry) => entry.campaign);
}

export function matchProjects(projects: KnownProject[], hint: string): KnownProject[] {
  const scored = projects
    .map((project) => ({ project, score: overlap(hint, project.name) }))
    .filter((entry) => entry.score >= 1);
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === best).map((entry) => entry.project);
}

/* ---------- Plataformas, formatos y frecuencia ---------- */

const PLATFORM_FORMATS: Record<ContentPlatform, ContentFormat[]> = {
  instagram: ['reel', 'carousel', 'story', 'photo'],
  tiktok: ['short_video'],
  youtube: ['long_video', 'short_video'],
  facebook: ['post', 'reel', 'photo'],
  linkedin: ['post', 'article', 'carousel'],
  x: ['post'],
  blog: ['article'],
  newsletter: ['newsletter'],
  other: ['post'],
};

const channelPlatforms = (channels: string[]) =>
  [...new Set(channels.map(platformFromText))].filter((platform) => platform !== 'other');

/** Formatos obligatorios: los pedidos o, si solo se excluyó alguno, los de las plataformas menos esos. */
export function requiredFormats(
  entities: PixelCommandEntities,
  platforms: ContentPlatform[],
): ContentFormat[] {
  if (entities.formats.length) return entities.formats;
  if (!entities.excludedFormats.length) return [];
  return [...new Set(platforms.flatMap((platform) => PLATFORM_FORMATS[platform]))].filter(
    (format) => !entities.excludedFormats.includes(format),
  );
}

const frequencyFor = (pieceCount: number | null, days: number) =>
  pieceCount
    ? Math.min(CONTENT_PLAN_MAX_FREQUENCY, Math.max(1, Math.round((pieceCount * 7) / days)))
    : undefined;

const list = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} y ${values[values.length - 1]}`;
const platformNames = (platforms: ContentPlatform[]) =>
  list(platforms.map((platform) => CONTENT_PLATFORM_LABELS[platform]));
const formatNames = (formats: ContentFormat[]) =>
  list(formats.map((format) => CONTENT_FORMAT_LABELS[format]));

const PROMO = /\bdescuent|\bofert|\bpromocion|\b2x1\b|\bgratis\b|\bprecio/;

/* ---------- Plan de contenido ---------- */

interface ContentPlanPieces {
  period: Period;
  platforms: ContentPlatform[];
  formats: ContentFormat[];
  frequency: number | undefined;
  pieces: number | null;
}

function contentPlanPieces(
  state: PlanningState,
  campaignChannels: string[],
): ContentPlanPieces | { missing: 'platforms' } {
  const { entities } = state;
  const fromRequest = entities.platforms;
  const fromCampaign = channelPlatforms(campaignChannels);
  const platforms = (
    fromRequest.length
      ? fromRequest
      : fromCampaign.length
        ? fromCampaign
        : state.context.dnaPlatforms
  ).filter((platform) => !entities.excludedPlatforms.includes(platform));
  if (!platforms.length) return { missing: 'platforms' };
  const period = periodFor(entities.timeframe, state.today);
  const frequency = frequencyFor(entities.pieceCount, period.days);
  const pieces =
    entities.pieceCount ??
    (state.context.workspaceType === 'enterprise'
      ? Math.max(1, Math.round((CONTENT_PLAN_DEFAULT_FREQUENCY * period.days) / 7))
      : null);
  return { period, platforms, formats: requiredFormats(entities, platforms), frequency, pieces };
}

function contentPlanParams(pieces: ContentPlanPieces, state: PlanningState, goal: string | null) {
  return {
    startDate: pieces.period.startDate,
    endDate: pieces.period.endDate,
    platforms: pieces.platforms,
    ...(pieces.formats.length ? { formats: pieces.formats } : {}),
    ...(pieces.frequency ? { frequency: pieces.frequency } : {}),
    ...(goal ? { goal: goal.slice(0, 200) } : {}),
    tzOffset: state.tzOffset,
  };
}

function contentPlanLines(pieces: ContentPlanPieces, owner: string, personal: boolean) {
  const count = pieces.pieces
    ? `${pieces.pieces} ${pieces.pieces === 1 ? 'pieza' : 'piezas'}`
    : 'las piezas que pide tu frecuencia habitual';
  const formats = pieces.formats.length ? ` (${formatNames(pieces.formats)})` : '';
  return {
    understood: [
      `Periodo: ${periodLabel(pieces.period)} (${pieces.period.days} ${pieces.period.days === 1 ? 'día' : 'días'})`,
      `Dónde: ${platformNames(pieces.platforms)}${formats}`,
    ],
    proposal: `Un plan de contenido de ${pieces.period.days} ${pieces.period.days === 1 ? 'día' : 'días'} con ${count}${formats}, desde ${personal ? 'tu ADN personal' : `el ADN de ${owner}`}`,
    creates: `Un plan de contenido con sus propuestas y el porqué de cada una (nada pasa a Contenido hasta que aceptes cada pieza)`,
  };
}

/* ---------- Resolución ---------- */

const QUESTIONS = {
  productOrService: '¿Qué producto o servicio vamos a lanzar?',
  objective: '¿Qué quieres lograr con la campaña?',
  platforms: '¿En qué plataforma quieres publicarlo?',
  tasks: '¿Qué tareas agrego? Puedes escribirlas separadas por comas.',
  projectName: '¿Cómo se llama el proyecto?',
  topic: '¿Sobre qué es la pieza?',
} as const;

const question = (field: string, text: string): PlanningOutcome => ({
  kind: 'question',
  field,
  question: text,
});

/** MissingInformationResolver + ActionPlan. */
export function planCommand(state: PlanningState): PlanningOutcome {
  switch (state.intent) {
    case 'create_campaign':
      return planCampaign(state);
    case 'plan_content':
      return planContent(state);
    case 'create_content':
      return planContentItem(state);
    case 'create_tasks':
      return planTasks(state);
    case 'organize_project':
      return planProject(state);
    default:
      return { kind: 'reply' };
  }
}

function planCampaign(state: PlanningState): PlanningOutcome {
  const { entities, context } = state;
  if (!entities.productOrService && !entities.objective) {
    return fold(state.request).includes('campan')
      ? question('objective', QUESTIONS.objective)
      : question('productOrService', QUESTIONS.productOrService);
  }
  const objective = entities.objective ?? `Lanzar ${entities.productOrService}`;
  const name = (
    entities.productOrService && entities.campaignType === 'launch'
      ? `Lanzamiento ${entities.productOrService}`
      : objective
  ).slice(0, 120);
  const period = entities.timeframe ? periodFor(entities.timeframe, state.today) : null;
  const platforms = entities.platforms.filter((p) => !entities.excludedPlatforms.includes(p));

  let content: ContentPlanPieces | null = null;
  if (entities.includeContent) {
    const pieces = contentPlanPieces({ ...state, entities: { ...entities, platforms } }, []);
    if ('missing' in pieces) return question('platforms', QUESTIONS.platforms);
    content = pieces;
  }

  const understood = [
    entities.productOrService ? `Qué: ${entities.productOrService}` : `Objetivo: ${objective}`,
    ...(entities.timeframe && period
      ? [`Cuándo: ${TIMEFRAME_LABELS[entities.timeframe]} (${periodLabel(period)})`]
      : []),
    ...(platforms.length ? [`Canales: ${platformNames(platforms)}`] : []),
  ];
  const proposal = [
    `Una campaña «${name}» con su estrategia: concepto, mensajes y piezas desde el ADN de ${context.ownerName} (tono, estilo y audiencia ya los conozco)`,
    ...(PROMO.test(fold(state.request))
      ? []
      : ['Sin descuentos ni promociones: no los mencionaste, así que la campaña no los promete']),
  ];
  const creates = [
    'Una campaña con su estrategia y las piezas que necesita (las revisas antes de producirlas)',
  ];
  const steps: StepDraft[] = [
    {
      id: 'step_1',
      type: 'generate_campaign',
      title: `Crear la campaña «${name}» y su estrategia`,
      params: {
        name,
        objective: objective.slice(0, 500),
        ...(entities.productOrService ? { productOrService: entities.productOrService } : {}),
        ...(entities.campaignType ? { campaignType: entities.campaignType } : {}),
        ...(platforms.length ? { channels: platforms.map((p) => CONTENT_PLATFORM_LABELS[p]) } : {}),
        ...(period
          ? {
              startDate: `${period.startDate}T12:00:00.000Z`,
              endDate: `${period.endDate}T12:00:00.000Z`,
            }
          : {}),
      },
    },
  ];
  if (content) {
    const lines = contentPlanLines(content, context.ownerName, false);
    proposal.push(`${lines.proposal}, que desarrolla la campaña`);
    creates.push(lines.creates);
    steps.push({
      id: 'step_2',
      type: 'generate_content_plan',
      title: 'Construir el plan de contenido de la campaña',
      params: { ...contentPlanParams(content, state, null), campaignFromStep: 'step_1' },
    });
  }
  const summary = content
    ? `Entendí que quieres ${wish(objective)}. Propongo una campaña alineada con el ADN de ${context.ownerName} y su plan de contenido en ${platformNames(content.platforms)}.`
    : `Entendí que quieres ${wish(objective)}. Propongo una campaña alineada con el ADN de ${context.ownerName}. Después, si quieres, la convierto en un plan de contenido.`;
  return { kind: 'proposal', summary, understood, proposal, creates, steps, campaignId: null };
}

const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);

function planContent(state: PlanningState): PlanningOutcome {
  const { entities, context } = state;
  const notes: string[] = [];
  let campaign: KnownCampaign | null = null;
  if (state.chosenCampaignId) {
    campaign = context.campaigns.find((c) => c.id === state.chosenCampaignId) ?? null;
  } else if (!state.noCampaign && context.campaigns.length) {
    const matches = matchCampaigns(context.campaigns, entities.campaignHint, state.request);
    if (matches.length > 1) {
      const names = matches.slice(0, 3).map((c) => `«${c.name}»`);
      return question('campaign', `¿Para cuál campaña? ${list(names)}, o sin campaña.`);
    }
    campaign = matches[0] ?? null;
    if (!campaign && entities.campaignHint) {
      notes.push(
        `No encontré una campaña «${entities.campaignHint}» en este Pixel: el plan parte del ADN`,
      );
    }
  } else if (!state.noCampaign && entities.campaignHint && context.workspaceType === 'enterprise') {
    notes.push(
      `No encontré una campaña «${entities.campaignHint}» en este Pixel: el plan parte del ADN`,
    );
  }
  if (campaign && !campaign.hasStrategy) {
    notes.push(`La campaña «${campaign.name}» aún no tiene estrategia: el plan parte del ADN`);
    campaign = null;
  }

  const pieces = contentPlanPieces(state, campaign?.channels ?? []);
  if ('missing' in pieces) return question('platforms', QUESTIONS.platforms);
  const personal = context.workspaceType === 'personal';
  const lines = contentPlanLines(pieces, context.ownerName, personal);
  const topic = entities.topic;
  const understood = [
    ...(campaign ? [`Campaña: «${campaign.name}»`] : []),
    ...(topic ? [`Tema: ${topic}`] : []),
    ...lines.understood,
    ...notes,
  ];
  const proposal = [
    campaign ? `${lines.proposal}, que desarrolla la campaña «${campaign.name}»` : lines.proposal,
  ];
  const summary = campaign
    ? `Ya tengo suficiente contexto para trabajar. Usaría la campaña «${campaign.name}» y construiría un plan de ${periodLabel(pieces.period)} en ${platformNames(pieces.platforms)}.`
    : `Ya tengo suficiente contexto para trabajar. Construiría un plan de ${periodLabel(pieces.period)} en ${platformNames(pieces.platforms)} desde ${personal ? 'tu ADN personal' : `el ADN de ${context.ownerName}`}${topic ? `, centrado en ${topic}` : ''}.`;
  return {
    kind: 'proposal',
    summary,
    understood,
    proposal,
    creates: [lines.creates],
    steps: [
      {
        id: 'step_1',
        type: 'generate_content_plan',
        title: campaign
          ? `Construir el plan de «${campaign.name}»`
          : 'Construir el plan de contenido',
        params: {
          ...contentPlanParams(pieces, state, topic ? `Hablar de ${topic}` : null),
          ...(campaign ? { campaignId: campaign.id } : {}),
        },
      },
    ],
    campaignId: campaign?.id ?? null,
  };
}

function planContentItem(state: PlanningState): PlanningOutcome {
  const { entities } = state;
  const title = entities.topic;
  if (!title) return question('topic', QUESTIONS.topic);
  const platform = entities.platforms[0] ?? state.context.dnaPlatforms[0] ?? null;
  const format = entities.formats[0] ?? null;
  const where = [
    format ? CONTENT_FORMAT_LABELS[format] : null,
    platform ? CONTENT_PLATFORM_LABELS[platform] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    kind: 'proposal',
    summary: `Guardo la idea «${title}» en tu contenido para que no se pierda.`,
    understood: [`Pieza: ${title}`, ...(where ? [`Formato: ${where}`] : [])],
    proposal: ['Una pieza en estado Idea, lista para desarrollarla cuando quieras'],
    creates: ['Una pieza en Contenido (Idea)'],
    steps: [
      {
        id: 'step_1',
        type: 'create_content_item',
        title: `Guardar «${title}» en Contenido`,
        params: { title: title.slice(0, 160), platform, format },
      },
    ],
    campaignId: null,
  };
}

function taskStep(
  titles: string[],
  dueDate: string | null,
  project: { id: string } | null,
  fromStep?: string,
): StepDraft {
  return {
    id: fromStep ? 'step_2' : 'step_1',
    type: 'create_tasks',
    title: `Crear ${titles.length} ${titles.length === 1 ? 'tarea' : 'tareas'}`,
    params: {
      tasks: titles.map((title) => ({
        title,
        status: 'todo',
        ...(dueDate ? { dueDate } : {}),
        ...(project ? { projectId: project.id } : {}),
      })),
      ...(fromStep ? { projectFromStep: fromStep } : {}),
    },
  };
}

function planTasks(state: PlanningState): PlanningOutcome {
  const { entities, context } = state;
  if (!entities.taskTitles.length) return question('tasks', QUESTIONS.tasks);
  const project = entities.projectHint
    ? (matchProjects(context.projects, entities.projectHint)[0] ?? null)
    : (state.chosenProject ?? null);
  const due = entities.timeframe ? periodFor(entities.timeframe, state.today).endDate : null;
  const where = project ? `en el proyecto «${project.name}»` : 'en tus tareas';
  return {
    kind: 'proposal',
    summary: `Apunto ${entities.taskTitles.length === 1 ? 'esta tarea' : `estas ${entities.taskTitles.length} tareas`} ${where}.`,
    understood: [
      ...entities.taskTitles.map((title) => `Tarea: ${title}`),
      ...(due ? [`Para: ${TIMEFRAME_LABELS[entities.timeframe!]}`] : []),
      ...(entities.projectHint && !project
        ? [`No encontré el proyecto «${entities.projectHint}»: quedan sin proyecto`]
        : []),
    ],
    proposal: [
      `${entities.taskTitles.length} ${entities.taskTitles.length === 1 ? 'tarea' : 'tareas'} por hacer ${where}`,
    ],
    creates: [
      `${entities.taskTitles.length === 1 ? 'Una tarea' : `${entities.taskTitles.length} tareas`} en Tareas`,
    ],
    steps: [taskStep(entities.taskTitles, due ? `${due}T12:00:00.000Z` : null, project)],
    campaignId: null,
  };
}

function planProject(state: PlanningState): PlanningOutcome {
  const { entities, context } = state;
  const due = entities.timeframe ? periodFor(entities.timeframe, state.today).endDate : null;
  let existing: KnownProject | null;
  if (entities.projectHint) {
    // «Crea un proyecto para preparar el final» no es «preparar mi parcial» aunque compartan palabras:
    // al pedir uno NUEVO solo se reutiliza un proyecto con exactamente ese nombre.
    const hint = fold(entities.projectHint).trim();
    existing = asksNewProject(state.request)
      ? (context.projects.find((project) => fold(project.name).trim() === hint) ?? null)
      : (matchProjects(context.projects, entities.projectHint)[0] ?? null);
  } else if (state.chosenProject) {
    // «Organiza esto» desde el detalle de un proyecto: ese proyecto.
    existing = state.chosenProject;
  } else if (context.projects.length === 1) {
    existing = context.projects[0]!;
  } else if (context.projects.length > 1) {
    const names = context.projects.slice(0, 3).map((p) => `«${p.name}»`);
    return question('projectHint', `¿Qué proyecto quieres organizar? Por ejemplo ${list(names)}.`);
  } else {
    return question('projectHint', QUESTIONS.projectName);
  }

  if (existing) {
    if (!entities.taskTitles.length) {
      return question(
        'tasks',
        `¿Qué tareas agrego a «${existing.name}»? Puedes escribirlas separadas por comas.`,
      );
    }
    return {
      kind: 'proposal',
      summary: `Organizo «${existing.name}» con ${entities.taskTitles.length} ${entities.taskTitles.length === 1 ? 'tarea' : 'tareas'}.`,
      understood: [
        `Proyecto: «${existing.name}»`,
        ...entities.taskTitles.map((title) => `Tarea: ${title}`),
      ],
      proposal: [`Las tareas quedan dentro de «${existing.name}», por hacer`],
      creates: [
        `${entities.taskTitles.length === 1 ? 'Una tarea' : `${entities.taskTitles.length} tareas`} en «${existing.name}»`,
      ],
      steps: [taskStep(entities.taskTitles, due ? `${due}T12:00:00.000Z` : null, existing)],
      campaignId: null,
    };
  }

  const name = entities.projectHint!.slice(0, 120);
  // «Crea el proyecto X y agrega tres tareas» sin decir cuáles: una pregunta, nunca tareas inventadas.
  if (!entities.taskTitles.length && /\btareas?\b/i.test(state.request)) {
    return question(
      'tasks',
      `¿Qué tareas agrego a «${name}»? Puedes escribirlas separadas por comas.`,
    );
  }
  const steps: StepDraft[] = [
    {
      id: 'step_1',
      type: 'create_project',
      title: `Crear el proyecto «${name}»`,
      params: { name, ...(due ? { dueDate: `${due}T12:00:00.000Z` } : {}) },
    },
  ];
  if (entities.taskTitles.length) {
    steps.push(taskStep(entities.taskTitles, null, null, 'step_1'));
  }
  return {
    kind: 'proposal',
    summary: `Creo el proyecto «${name}»${entities.taskTitles.length ? ` con ${entities.taskTitles.length} ${entities.taskTitles.length === 1 ? 'tarea' : 'tareas'}` : ''}.`,
    understood: [
      `Proyecto nuevo: «${name}»`,
      ...entities.taskTitles.map((title) => `Tarea: ${title}`),
    ],
    proposal: [
      `Un proyecto activo${due ? ` con fecha límite ${TIMEFRAME_LABELS[entities.timeframe!]}` : ''}`,
      ...(entities.taskTitles.length
        ? ['Sus tareas, por hacer']
        : ['Sin tareas todavía: puedes pedírmelas después']),
    ],
    creates: [
      'Un proyecto',
      ...(entities.taskTitles.length
        ? [
            `${entities.taskTitles.length} ${entities.taskTitles.length === 1 ? 'tarea' : 'tareas'} dentro de él`,
          ]
        : []),
    ],
    steps,
    campaignId: null,
  };
}

/** "Campaña de Amor y Amistad" → "una campaña de Amor y Amistad"; "Lanzar X" → "lanzar X". */
function wish(objective: string): string {
  const lower = lowerFirst(objective);
  return /^campañas?\b/.test(lower) ? `una ${lower}` : lower;
}
