import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  type ContentAngle,
  type ContentFormat,
  type ContentPlatform,
  type GeneratedContentPlan,
} from '@pixel/contracts';
import type { PlanningPayload } from '../contentPlanningPayload.js';

/*
 * Plan de contenido del proveedor DEMO (desarrollo sin credenciales y tests). No es un modelo:
 * compone propuestas con reglas, usando solo palabras del contexto real (proyectos, temas,
 * habilidades, necesidades de la audiencia, objetivos, estilo y tono). Sin cifras ni nombres
 * propios inventados. El plan queda marcado como `mode: demo` y la interfaz lo dice.
 */

type SourceKind = 'project' | 'theme' | 'skill' | 'need';

interface Source {
  kind: SourceKind;
  label: string;
  projectId: string | null;
}

const ANGLES: Record<SourceKind, ContentAngle[]> = {
  project: ['process', 'behind_the_scenes', 'case', 'storytelling', 'portfolio'],
  theme: ['education', 'opinion', 'reflection', 'storytelling'],
  skill: ['education', 'comparison', 'process'],
  need: ['opinion', 'education', 'case'],
};

const ANGLE_WORDS: Record<ContentAngle, string> = {
  education: 'educación',
  opinion: 'opinión',
  process: 'proceso',
  case: 'caso',
  behind_the_scenes: 'detrás de cámara',
  reflection: 'reflexión',
  portfolio: 'portafolio',
  comparison: 'comparación',
  storytelling: 'historia',
};

const DEFAULT_FORMAT: Record<ContentPlatform, ContentFormat> = {
  instagram: 'reel',
  tiktok: 'short_video',
  youtube: 'long_video',
  facebook: 'post',
  linkedin: 'post',
  x: 'post',
  blog: 'article',
  newsletter: 'newsletter',
  other: 'post',
};

const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const normalizeTitle = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

/** Sujeto en el texto: los proyectos van entre comillas con su nombre real. */
const subject = (source: Source) =>
  source.kind === 'project' ? `«${source.label}»` : lower(source.label);

function title(angle: ContentAngle, source: Source, problem: string | null): string {
  const s = subject(source);
  switch (angle) {
    case 'process':
      return `El proceso detrás de ${s}`;
    case 'behind_the_scenes':
      return `Lo que no se ve de ${s}`;
    case 'case':
      return `${capitalize(s)}: del reto al resultado`;
    case 'portfolio':
      return `Una mirada de cerca a ${s}`;
    case 'storytelling':
      return `La historia de ${s}`;
    case 'education':
      return `Lo esencial sobre ${s}`;
    case 'opinion':
      return `Mi postura sobre ${s}`;
    case 'reflection':
      return `Qué aprendí con ${s}`;
    case 'comparison':
      return problem ? `${capitalize(lower(problem))} frente a ${s}` : `Dos caminos hacia ${s}`;
  }
}

function hook(angle: ContentAngle, source: Source): string {
  const s = subject(source);
  switch (angle) {
    case 'process':
      return `Así empieza ${s} antes de que nadie lo vea.`;
    case 'behind_the_scenes':
      return `Esto es lo que pasa detrás de ${s}.`;
    case 'case':
      return `El punto de partida de ${s} no era el que imaginas.`;
    case 'portfolio':
      return `Mira ${s} de cerca.`;
    case 'storytelling':
      return `Todo empezó con ${s}.`;
    case 'education':
      return `Si te interesa ${s}, empieza por aquí.`;
    case 'opinion':
      return `Voy a decir algo sobre ${s} que no se dice mucho.`;
    case 'reflection':
      return `Esto cambió mi forma de ver ${s}.`;
    case 'comparison':
      return `Dos caminos frente a ${s}.`;
  }
}

function sourcesOf(payload: PlanningPayload): Source[] {
  const { persona } = payload;
  const plain = (kind: SourceKind, labels: string[]) =>
    labels.map((label) => ({ kind, label, projectId: null }));
  return [
    ...payload.projects.map((project) => ({
      kind: 'project' as const,
      label: project.name,
      projectId: project.id,
    })),
    ...plain('theme', persona.content.themes),
    ...plain('skill', persona.skills),
    ...plain('need', persona.audience.needs),
  ];
}

export function composeDemoContentPlan(payload: PlanningPayload): GeneratedContentPlan {
  const { persona, request } = payload;
  const goal = request.goal ?? persona.goals.content[0] ?? persona.goals.professional[0] ?? null;
  const audience = persona.audience.primaryAudience;
  const style = persona.creative.styles[0];
  const tone = persona.communication.tone[0];
  const problem = persona.audience.problems[0] ?? null;
  const sources = sourcesOf(payload);
  if (sources.length === 0) {
    sources.push({
      kind: 'theme',
      label: goal ?? persona.professionalIdentity[0] ?? persona.name,
      projectId: null,
    });
  }

  const pillars: GeneratedContentPlan['pillars'] = [];
  const projectPillar = 'Trabajo real';
  const themePillars = persona.content.themes.slice(0, 2).map(capitalize);
  const authorityPillar = capitalize(persona.goals.professional[0] ?? 'criterio profesional');
  if (payload.projects.length > 0) {
    pillars.push({
      name: projectPillar,
      rationale: `Tus proyectos activos (${listOf(payload.projects.map((project) => project.name))}) son la fuente más honesta de contenido.`,
    });
  }
  for (const name of themePillars) {
    pillars.push({
      name,
      rationale: `Es uno de los temas que quieres tratar${audience ? ' y le habla a tu audiencia definida' : ''}.`,
    });
  }
  pillars.push({
    name: authorityPillar,
    rationale: persona.skills.length
      ? `Une tus habilidades (${listOf(persona.skills.map(lower))}) con lo que quieres conseguir.`
      : 'Muestra tu criterio y lo que quieres conseguir.',
  });

  // Ronda a ronda: primero los proyectos, después temas, habilidades y necesidades. Se saltan los
  // títulos ya usados en contenido reciente o en planes anteriores (como se le pide al modelo).
  const used = new Set(
    [...payload.recentContent, ...payload.previousProposals].map((entry) =>
      normalizeTitle(entry.title),
    ),
  );
  const sequence: { source: Source; angle: ContentAngle }[] = [];
  for (let round = 0; sequence.length < request.itemCount && round < 12; round += 1) {
    for (const [sourceIndex, source] of sources.entries()) {
      const angles = ANGLES[source.kind];
      const angle = angles[(round + sourceIndex) % angles.length]!;
      const key = normalizeTitle(title(angle, source, problem));
      if (used.has(key)) continue;
      used.add(key);
      sequence.push({ source, angle });
      if (sequence.length >= request.itemCount) break;
    }
  }

  const items = sequence.map(({ source, angle }, index) => {
    const platform = request.allowedPlatforms[index % request.allowedPlatforms.length]!;
    const preferred =
      request.preferredFormats[index % Math.max(request.preferredFormats.length, 1)];
    const textual = platform === 'blog' || platform === 'newsletter';
    const format = textual ? DEFAULT_FORMAT[platform] : (preferred ?? DEFAULT_FORMAT[platform]);
    const pillar =
      source.kind === 'project'
        ? projectPillar
        : source.kind === 'theme' && themePillars.includes(capitalize(source.label))
          ? capitalize(source.label)
          : authorityPillar;
    const why =
      source.kind === 'project'
        ? 'convierte un proyecto real en contenido, en lugar de partir de una idea genérica'
        : source.kind === 'theme'
          ? `parte de uno de tus temas (${lower(source.label)})`
          : source.kind === 'skill'
            ? `pone en valor una de tus habilidades (${lower(source.label)})`
            : `responde a una necesidad de tu audiencia definida (${lower(source.label)})`;
    return {
      title: title(angle, source, problem),
      concept: `Una pieza de ${ANGLE_WORDS[angle]} sobre ${subject(source)}${style ? `, con una estética ${lower(style)}` : ''}${tone ? ` y un tono ${lower(tone)}` : ''}.`,
      rationale: `Te lo propongo porque ${why}${goal ? ` y acerca tu objetivo de ${lower(goal)}` : ''}${audience ? ` a ${lower(audience)}` : ''}.`,
      objective: goal ? capitalize(lower(goal)) : 'Mostrar tu criterio',
      audience: [audience, persona.audience.secondaryAudiences[0]].filter(
        (value): value is string => Boolean(value),
      ),
      platform,
      format,
      pillar,
      angle,
      hook: hook(angle, source),
      suggestedAngle: `Contado como ${ANGLE_WORDS[angle]}, en tu voz.`,
      suggestedDate: null,
      projectId: source.projectId,
    };
  });

  const platformNames = listOf(
    request.allowedPlatforms.map((value) => CONTENT_PLATFORM_LABELS[value]),
  );
  const formatNames = listOf(
    (request.preferredFormats.length
      ? request.preferredFormats
      : request.allowedPlatforms.map((value) => DEFAULT_FORMAT[value])
    ).map((value) => CONTENT_FORMAT_LABELS[value].toLocaleLowerCase('es')),
  );
  const strategySummary = [
    `Para este periodo propongo priorizar ${listOf(pillars.map((pillar) => lower(pillar.name)))} en ${platformNames}, con ${formatNames} como formatos principales.`,
    payload.projects.length > 0
      ? 'Tus proyectos activos son la fuente principal: contenido a partir de trabajo real, no de ideas genéricas.'
      : 'Sin proyectos activos, el plan parte de tu ADN personal: tus temas, tus habilidades y tu audiencia definida.',
    goal ? `Todo apunta a ${lower(goal)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { strategySummary, pillars, items };
}
