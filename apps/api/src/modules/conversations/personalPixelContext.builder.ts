import {
  BRAND_ARCHETYPES,
  LANGUAGES,
  type AvatarProfile,
  type BrandArchetype,
  type PersonalDna,
} from '@pixel/contracts';
import { renderPersonalBrief, type CreativeLever, type PersonalBrief } from '../../ai/brief.js';
import { renderDailyBriefContext, type DailyBriefContext } from '../../ai/dailyBriefContext.js';
import {
  DEFAULT_LIMITS,
  detectFocus,
  trimHistory,
  type ContextLimits,
  type HistoryMessage,
  type PixelContext,
} from './pixelContext.builder.js';

/*
 * Composición del contexto Personal: el prompt con el que habla el Pixel Personal de UNA persona.
 *
 * Función pura: recibe datos ya cargados por el PersonalContextBuilder (context/), todos del mismo
 * workspace personal, y nunca consulta la base de datos ni recibe datos de empresas. Igual que en
 * Enterprise, no recita el ADN: lo convierte en criterio (palancas, postura, límites).
 */

export interface PersonalPixelContextInput {
  personalDna: PersonalDna;
  avatar: AvatarProfile | null;
  /** Memorias creativas activas del workspace (más recientes primero). */
  memories?: string[];
  /** Dirección del día vigente (solo la de hoy, acotada). */
  dailyBrief?: DailyBriefContext | null;
  history: HistoryMessage[];
  userMessage: string;
  limits?: Partial<ContextLimits>;
}

/** Cómo aborda cada arquetipo una idea, dicho a la persona (segunda persona). */
const PERSONAL_STANCE: Record<BrandArchetype, { title: string; stance: string }> = {
  creator: {
    title: 'Tu proceso',
    stance: 'Muestra tu oficio y tu proceso: la calidad se ve en cómo haces las cosas.',
  },
  caregiver: {
    title: 'A quién cuidas',
    stance: 'Pon a las personas en el centro: a quién ayudas y cómo lo cuidas.',
  },
  explorer: {
    title: 'El recorrido',
    stance: 'Invita a descubrir contigo: cada pieza es un recorrido con un hallazgo al final.',
  },
  sage: {
    title: 'Lo que nadie explica',
    stance: 'Enseña algo útil y claro; la confianza se gana explicando, no prometiendo.',
  },
  hero: {
    title: 'El reto',
    stance: 'Plantea un reto real y muestra cómo lo superas.',
  },
  magician: {
    title: 'Antes y después',
    stance: 'Muestra la transformación: el antes, el después y lo que lo hizo posible.',
  },
  rebel: {
    title: 'Contra la norma',
    stance: 'Nombra la convención de tu campo y rómpela a propósito.',
  },
  lover: {
    title: 'El detalle',
    stance: 'Apuesta por lo sensorial y el detalle: que se sienta antes de que se entienda.',
  },
  jester: {
    title: 'Sin tanta seriedad',
    stance: 'Usa el humor para decir algo verdadero y hacer comunidad.',
  },
  everyman: {
    title: 'Como en casa',
    stance: 'Habla desde lo cotidiano y tu comunidad, sin pretensiones.',
  },
  ruler: {
    title: 'Trabajo terminado',
    stance: 'Demuestra solidez con evidencia: procesos, resultados y trabajo terminado.',
  },
  innocent: {
    title: 'Simple',
    stance: 'Hazlo simple y optimista: una idea clara, sin ruido.',
  },
};

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const joinEs = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

/** El objetivo que guía una petición: los de contenido para contenido, los profesionales si no. */
function leadingGoal(dna: PersonalDna, focus: string[]): string | null {
  const { goals } = dna;
  const ordered = focus.includes('social')
    ? [...goals.content, ...goals.professional, ...goals.shortTerm, ...goals.longTerm]
    : [...goals.professional, ...goals.shortTerm, ...goals.content, ...goals.longTerm];
  return ordered[0] ?? goals.personal[0] ?? null;
}

function buildPersonalLevers(dna: PersonalDna, focus: string[]): CreativeLever[] {
  const levers: CreativeLever[] = [];
  const goal = leadingGoal(dna, focus);
  const [theme, secondTheme] = dna.contentIdentity.themes;
  const [problem] = dna.audience.problems;
  const [need] = dna.audience.needs;
  const perception = dna.audience.desiredPerception.slice(0, 3);
  const archetype = dna.personality.archetypes[0];

  if (theme) {
    levers.push({
      id: 'theme',
      title: capitalize(theme),
      idea: `Convierte «${theme}» en la serie de la semana${goal ? `, pensada para tu objetivo «${goal}»` : ''}.`,
      proof: `Cada pieza enseña algo concreto de tu trabajo real${secondTheme ? ` y cierra conectando con «${secondTheme}»` : ''}, no una opinión genérica.`,
    });
  }
  if (problem && need) {
    levers.push({
      id: 'tension',
      title: `Sin ${lower(problem)}`,
      idea: `Parte de una frustración real de tu público («${problem}») y responde con lo que busca («${need}»).`,
      proof: 'Abre con la frustración reconocible y cierra con tu forma de resolverla.',
    });
  }
  if (perception.length) {
    levers.push({
      id: 'perception',
      title: capitalize(perception[0]!),
      idea: `Que te perciban como ${joinEs(perception)} sin decirlo: se demuestra con decisiones de imagen, ritmo y tono.`,
      proof: 'Ninguna pieza lo afirma; todas lo hacen evidente.',
    });
  }
  if (archetype) {
    const stance = PERSONAL_STANCE[archetype];
    levers.push({
      id: 'archetype',
      title: stance.title,
      idea: stance.stance,
      proof: 'Que se note en la forma de contar, no en adjetivos sobre ti.',
    });
  }
  if (levers.length === 0 && goal) {
    levers.push({
      id: 'goal',
      title: capitalize(goal),
      idea: `Cada pieza de esta semana empuja un único objetivo: «${goal}».`,
      proof: 'Si una idea no acerca ese objetivo, se descarta.',
    });
  }

  if (focus.includes('audience')) {
    levers.sort((a, b) => Number(b.id === 'tension') - Number(a.id === 'tension'));
  }
  return levers;
}

/** "¿Qué publico?" también es una petición de contenido aunque no nombre una red. */
const CONTENT_REQUEST = /\b(public|contenido|post)/i;

function personalFocus(message: string): string[] {
  const focus = detectFocus(message);
  if (!CONTENT_REQUEST.test(message) || focus.includes('social')) return focus;
  return [...focus.filter((item) => item !== 'general'), 'social'];
}

const list = (items: string[], limits: ContextLimits) =>
  items.slice(0, limits.listItems).map((item) => truncate(item, limits.itemChars));

/** Sección de la dirección del día: para "¿qué hago ahora?", "¿qué es urgente?"… */
function renderDailySection(daily: DailyBriefContext): string {
  const priorities = daily.priorities
    .map((priority, index) => `${index + 1}. ${priority.title}: ${priority.rationale}`)
    .join('\n');
  return `Dirección de hoy (${daily.localDate}, Daily Director)${daily.stale ? ' — ATENCIÓN: su trabajo cambió desde entonces; puede estar desactualizada, dilo si es relevante y sugiere «Actualizar dirección» en Inicio' : ''}:
${daily.summary}${priorities ? `\nPrioridades:\n${priorities}` : ''}${daily.warnings.length ? `\nRequiere atención:\n${daily.warnings.map((warning) => `- ${warning}`).join('\n')}` : ''}${daily.content ? `\nContenido sugerido: ${daily.content}` : ''}
Si pregunta qué hacer ahora, qué es urgente o qué está dejando atrás, responde desde esta dirección. No puedes marcar tareas como hechas ni modificar nada: si te lo pide, dile que lo haga desde Tareas.`;
}

export function buildPersonalPixelContext(
  input: PersonalPixelContextInput,
): PixelContext<PersonalBrief> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const { personalDna: dna, avatar } = input;
  const focus = personalFocus(input.userMessage);
  const includesAvatar = Boolean(avatar && (focus.includes('avatar') || focus.includes('visual')));
  const c = dna.communication;
  const archetypeId = dna.personality.archetypes[0] ?? null;
  const language = LANGUAGES[c.language];
  const name = dna.identity.name;

  const brief: PersonalBrief = {
    person: name,
    professionalIdentity: list(dna.identity.professionalIdentity, limits),
    summary: dna.identity.summary ? truncate(dna.identity.summary, 400) : null,
    skills: list(dna.professionalProfile.skills, limits),
    strengths: list(dna.professionalProfile.strengths, limits),
    interests: list(dna.identity.interests, limits),
    goals: {
      professional: list(dna.goals.professional, limits),
      personal: list(dna.goals.personal, limits),
      content: list(dna.goals.content, limits),
      shortTerm: list(dna.goals.shortTerm, limits),
      longTerm: list(dna.goals.longTerm, limits),
    },
    audience: {
      primary: dna.audience.primaryAudience ? truncate(dna.audience.primaryAudience, 300) : null,
      needs: list(dna.audience.needs, limits),
      problems: list(dna.audience.problems, limits),
      desiredPerception: list(dna.audience.desiredPerception, limits),
    },
    personality: list(dna.personality.traits, limits),
    archetype: archetypeId
      ? {
          id: archetypeId,
          name: BRAND_ARCHETYPES[archetypeId].name,
          stance: PERSONAL_STANCE[archetypeId].stance,
        }
      : null,
    tone: {
      traits: list(c.tone, limits),
      formality: c.formality,
      energy: c.energy,
      language,
    },
    vocabulary: { use: list(c.preferredWords, limits), avoid: list(c.avoidWords, limits) },
    creative: {
      styles: list(dna.creativeIdentity.styles, limits),
      colors: dna.creativeIdentity.colors.slice(0, 5).map((color) => color.name ?? color.hex),
      references: list(dna.creativeIdentity.references, limits),
      preferences: list(dna.creativeIdentity.visualPreferences, limits),
      avoid: list(dna.creativeIdentity.avoidVisuals, limits),
    },
    content: {
      themes: list(dna.contentIdentity.themes, limits),
      formats: list(dna.contentIdentity.preferredFormats, limits),
      platforms: list(dna.contentIdentity.platforms, limits),
      frequency: dna.contentIdentity.frequencyPreference,
    },
    workStyle: {
      times: list(dna.workStyle.preferredWorkTimes, limits),
      planning: list(dna.workStyle.planningStyle, limits),
      execution: list(dna.workStyle.executionStyle, limits),
      focus: list(dna.workStyle.focusStyle, limits),
      productivity: list(dna.workStyle.productivityPreferences, limits),
    },
    wantsHelpWith: list(dna.supportNeeds.wantsHelpWith, limits),
    expectations: dna.supportNeeds.expectations
      ? truncate(dna.supportNeeds.expectations, 400)
      : null,
    restrictions: list(dna.restrictions, limits),
    focus,
    levers: buildPersonalLevers(dna, focus),
    avatar:
      includesAvatar && avatar
        ? { name: avatar.name, concept: avatar.concept, personality: avatar.personalityTraits }
        : null,
  };

  const levers = brief.levers
    .map((lever, i) => `${i + 1}. «${lever.title}»: ${lever.idea} ${lever.proof}`)
    .join('\n');
  const memories = list(input.memories ?? [], limits);
  const register =
    c.formality <= 2
      ? 'Tutea con naturalidad, como alguien de su equipo.'
      : c.formality >= 4
        ? 'Tutea, pero con un registro cuidado y sin jerga.'
        : 'Tutea, con un registro cercano y profesional.';
  const rhythm =
    c.energy >= 4
      ? 'Escribe con energía: frases cortas y verbos activos.'
      : c.energy <= 2
        ? 'Escribe con calma: frases pausadas, sin exageraciones.'
        : 'Mantén un ritmo equilibrado.';
  const helpWith = brief.wantsHelpWith.length ? joinEs(brief.wantsHelpWith) : null;

  const system = `Eres Pixel, el Director Creativo Personal de ${name}. Trabajas para una persona, no para una marca: le hablas de tú, en segunda persona, y nunca en nombre de una empresa.

Qué eres (y qué no):
- Eres su director creativo: le ayudas a organizar ideas, pensar creativamente, orientar su contenido, tomar decisiones, mantener coherencia con quien es, planificar de forma creativa, apoyar sus proyectos y alinear su trabajo con sus objetivos.
- No eres terapeuta, ni un life coach genérico, ni un asistente administrativo genérico. Si te piden algo de eso, reconduce con tacto hacia lo creativo o dilo con naturalidad.${helpWith ? `\n- Te pidió ayuda sobre todo con: ${helpWith}.` : ''}

Cómo trabajas:
- Usa su ADN personal como criterio, no como contenido. No le describas cómo es ni enumeres sus rasgos: haz que se noten en el ángulo, los formatos, las imágenes y las palabras que propones.
- Propón una idea concreta con un concepto central, por qué encaja con sus objetivos y su público frente a la opción obvia, y cómo se ejecuta (piezas, formatos, plataformas, ritmo).
- Evita respuestas genéricas como «publica un reel, un carrusel y una historia»: cada propuesta debe salir de sus temas, su estilo y sus objetivos.
- Respeta siempre lo que quiere evitar. No inventes proyectos, clientes, cifras, logros ni fechas que no estén en el contexto; si necesitas uno (por ejemplo, en qué está trabajando ahora), propone primero y termina con una sola pregunta concreta.
- Sé conciso: unas 220 palabras salvo que te pida más. Usa títulos cortos en **negrita** y viñetas con «- ».
- Solo conoces a esta persona. No tienes datos de otras personas ni de empresas.

Cómo le hablas (${language}, tono ${brief.tone.traits.join(', ')}):
- ${register}
- ${rhythm}${brief.vocabulary.use.length ? `\n- Puedes usar palabras suyas como ${brief.vocabulary.use.map((word) => `«${word}»`).join(', ')}.` : ''}${brief.vocabulary.avoid.length ? `\n- Nunca uses: ${brief.vocabulary.avoid.map((word) => `«${word}»`).join(', ')}.` : ''}

Ejemplo de criterio (persona ficticia, solo para ilustrar la diferencia):
- Mal: «Publica un reel, un carrusel y una historia esta semana.»
- Bien: «Aprovecha el proyecto que tienes entre manos: convierte tu proceso en una pieza de autoridad, del problema al concepto y al resultado.»

Palancas creativas para ${name} (puntos de partida; elige, combina o descarta según la petición):
${levers || '- Aún no hay suficiente información: propone desde sus objetivos y pregunta lo imprescindible.'}
${brief.avatar ? `\nSu personaje, ${brief.avatar.name}: ${brief.avatar.concept} Úsalo si ayuda a la idea.\n` : ''}${memories.length ? `\nLo que ya decidieron juntos (memoria creativa; respétalo):\n${memories.map((memory) => `- ${memory}`).join('\n')}\n` : ''}
${input.dailyBrief ? `${renderDailySection(input.dailyBrief)}\n` : ''}
Contexto personal (referencia para razonar; no lo cites literalmente):
${renderPersonalBrief(brief)}${input.dailyBrief ? `\n${renderDailyBriefContext(input.dailyBrief)}` : ''}`;

  const history = trimHistory(input.history, limits);
  return {
    system,
    messages: [...history, { role: 'user', content: input.userMessage }],
    brief,
    stats: {
      historyMessages: history.length,
      historyChars: history.reduce((sum, turn) => sum + turn.content.length, 0),
      systemChars: system.length,
      includesAvatar,
      memories: memories.length,
    },
  };
}
