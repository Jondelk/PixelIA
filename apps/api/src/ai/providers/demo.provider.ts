import type {
  AIProvider,
  AIResultMeta,
  GenerateStructuredInput,
  GenerateTextInput,
} from '../AIProvider.js';
import {
  extractBrief,
  extractPersonalBrief,
  type CreativeBrief,
  type CreativeLever,
  type PersonalBrief,
} from '../brief.js';
import { CAMPAIGN_SCHEMA_NAME, extractCampaignPayload } from '../campaignStrategyPayload.js';
import { extractPlanningPayload, PLANNING_SCHEMA_NAME } from '../contentPlanningPayload.js';
import {
  DAILY_QUESTION,
  extractDailyBriefContext,
  type DailyBriefContext,
} from '../dailyBriefContext.js';
import { AIProviderError } from '../errors.js';
import {
  extractOperationsStatusContext,
  OPERATIONS_QUESTION,
  type OperationsStatusContext,
} from '../operationsStatusContext.js';
import { composeDemoCampaignStrategy } from './demoCampaignStrategy.js';
import { composeDemoContentPlan } from './demoContentPlan.js';

/**
 * Proveedor local sin IA, para desarrollo sin credenciales y para tests deterministas.
 * Compone una propuesta creativa a partir del brief del contexto: el de marca (Enterprise, en
 * «nosotros») o el personal (Pixel Personal, en «tú»), con sus palancas, tono, formatos y
 * restricciones. No sustituye a un modelo: sirve para recorrer el producto de punta a punta.
 */

const pick = <T>(items: readonly T[], seed: number): T | undefined =>
  items[seed % Math.max(items.length, 1)];

function seedOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);

function formats(brief: CreativeBrief): string[] {
  const { formality, energy } = brief.tone;
  const professional = formality >= 4;
  const rhythm =
    energy >= 4
      ? 'piezas cortas de 7 a 10 segundos, con cortes rápidos'
      : energy <= 2
        ? 'videos pausados de 20 a 30 segundos, con planos largos y sonido ambiente'
        : 'videos de 15 a 20 segundos con un ritmo tranquilo';
  const channels = professional ? 'LinkedIn y un newsletter' : 'Instagram y TikTok';
  const recurring = brief.visual.recurring[0];
  const material = brief.visual.materials[0];
  const list = [
    `${capitalize(rhythm)} para ${channels}.`,
    professional
      ? 'Carruseles con un dato o caso por lámina, sin adornos.'
      : 'Carruseles tipo «detrás de escena» que cuenten una historia en 5 láminas.',
  ];
  if (recurring || material) {
    list.push(
      `Identidad de las piezas con ${[recurring && lower(recurring), material && `texturas de ${material}`].filter(Boolean).join(' y ')}, en una paleta ${brief.visual.temperature}.`,
    );
  }
  if (brief.focus.includes('launch')) {
    list.push('Secuencia en tres tiempos: intriga, revelación y prueba con clientes reales.');
  }
  return list;
}

function sampleCopy(brief: CreativeBrief, lever: CreativeLever): string {
  const word = brief.vocabulary.use[0];
  const differentiator = brief.differentiators[0];
  const opening = lever.id === 'origin' && brief.origin ? `Empezó en ${brief.origin}` : lever.title;
  const closing = differentiator ? `${capitalize(differentiator)}.` : `${brief.brand}.`;
  const middle = word ? ` Esto es ${lower(word)} de verdad.` : '';
  return `${capitalize(opening)}.${middle} ${closing}`;
}

function question(brief: CreativeBrief): string {
  if (brief.focus.includes('social'))
    return '¿Qué red es prioritaria para nosotros este trimestre?';
  if (brief.focus.includes('launch')) return '¿Para cuándo tenemos previsto el lanzamiento?';
  if (brief.focus.includes('naming'))
    return '¿Quieres que exploremos más opciones en otra dirección?';
  return '¿Qué objetivo concreto queremos medir con esto?';
}

export function composeCreativeReply(brief: CreativeBrief, request: string): string {
  const seed = seedOf(request);
  const levers = brief.levers.length
    ? brief.levers
    : [{ id: 'archetype', title: brief.brand, idea: brief.archetype.stance, proof: brief.essence }];
  const main = levers[0]!;
  const support = levers.find((lever) => lever.id !== main.id);
  const avoid = [
    ...brief.restrictions,
    ...brief.dislikes,
    ...brief.vocabulary.avoid.map((word) => `la palabra «${word}»`),
  ].slice(0, 3);

  const lines = [
    `**Idea central: «${main.title}»**`,
    `${main.idea} ${main.proof}`,
    '',
    '**Por qué para nosotros**',
    `Es más fiel a lo que somos que hablar de atributos genéricos. ${brief.archetype.stance}${support ? ` Lo reforzamos con otra palanca: ${lower(support.idea)}` : ''}`,
    '',
    '**Cómo la aterrizamos**',
    ...formats(brief).map((item) => `- ${item}`),
    '',
    '**En nuestra voz**',
    `«${sampleCopy(brief, main)}»`,
  ];
  if (avoid.length)
    lines.push('', '**Qué evitaríamos**', ...avoid.map((item) => `- ${capitalize(item)}`));
  if (brief.avatar && brief.focus.includes('avatar')) {
    lines.push(
      '',
      `**Nuestro personaje**`,
      `${brief.avatar.name} puede protagonizar las piezas: ${lower(brief.avatar.concept)}`,
    );
  }
  lines.push('', pick([question(brief)], seed) ?? '');
  return lines.join('\n').trim();
}

// ---------- Pixel Personal ----------

const joinEs = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

function personalFormats(brief: PersonalBrief): string[] {
  const { energy } = brief.tone;
  const { formats, platforms, frequency, themes } = brief.content;
  const where = platforms.length ? ` en ${joinEs(platforms.slice(0, 3))}` : '';
  const rhythm =
    energy >= 4
      ? 'clips cortos de 7 a 15 segundos, con el momento clave en el primer segundo y cortes rápidos'
      : energy <= 2
        ? 'piezas pausadas, con pocas palabras, mucho aire y una sola idea por pieza'
        : 'piezas de ritmo tranquilo y claro';
  // Sin frecuencia en su ADN no se propone una cifra: solo el ritmo que encaja con su energía.
  const list = [`${capitalize(frequency ?? 'Esta semana')}${where}: ${rhythm}.`];
  if (formats.length) {
    list.push(
      `Formatos: ${joinEs(formats.slice(0, 3))}${themes[1] ? `; una de las piezas puede abrir «${themes[1]}»` : ''}.`,
    );
  }
  const look = [...brief.creative.styles.slice(0, 2), ...brief.creative.preferences.slice(0, 2)];
  if (look.length) list.push(`Mantén tu estética: ${joinEs(look)}.`);
  return list;
}

function personalCopy(brief: PersonalBrief, lever: CreativeLever): string {
  const [first, second, third] = brief.vocabulary.use;
  if (brief.tone.energy >= 4) {
    const shout = capitalize(first ?? 'vamos');
    // "En directo" solo si su contenido ya es en vivo (plataformas, formatos, temas o profesión).
    const live = /twitch|directo|stream|en vivo|live/i.test(
      [
        ...brief.content.platforms,
        ...brief.content.formats,
        ...brief.content.themes,
        ...brief.professionalIdentity,
      ].join(' '),
    );
    return `¡${shout}! ${capitalize(brief.content.themes[0] ?? lever.title)}${live ? ' en directo' : ''}${second ? `: ${lower(second)} de verdad` : ''}.`;
  }
  const words = [first, second, third].filter((word): word is string => Boolean(word));
  const need = brief.audience.needs[0];
  return `${words.length ? `${capitalize(joinEs(words))}. ` : ''}${capitalize(need ?? lever.title)}.`;
}

export function composePersonalReply(brief: PersonalBrief, request: string): string {
  const levers = brief.levers.length
    ? brief.levers
    : [
        {
          id: 'goal',
          title: brief.person,
          idea: 'Partamos de lo que quieres conseguir y de a quién le hablas.',
          proof: 'Una sola idea, bien ejecutada.',
        },
      ];
  const main = levers[0]!;
  const support = levers.find((lever) => lever.id !== main.id);
  const goal = brief.goals.professional[0] ?? brief.goals.content[0] ?? brief.goals.shortTerm[0];
  const audience = brief.audience.primary;
  const avoid = [
    ...brief.creative.avoid,
    ...brief.vocabulary.avoid.map((word) => `decir «${word}»`),
  ].slice(0, 3);
  const thisWeek = /\bsemana\b/i.test(request);

  const lines = [
    `**${thisWeek ? 'Mi propuesta para esta semana' : 'Mi propuesta'}: «${main.title}»**`,
    `${main.idea} ${main.proof}`,
    '',
    '**Por qué encaja contigo**',
    [
      goal ? `Te acerca a «${goal}»` : 'Es coherente con quien eres',
      audience ? ` y le habla a ${lower(audience)}.` : '.',
      brief.archetype ? ` ${brief.archetype.stance}` : '',
      support ? ` Lo reforzaría con otra palanca: ${lower(support.idea)}` : '',
    ].join(''),
    '',
    '**Cómo lo aterrizaría**',
    ...personalFormats(brief).map((item) => `- ${item}`),
    '',
    '**En tu voz**',
    `«${personalCopy(brief, main)}»`,
  ];
  if (avoid.length) {
    lines.push('', '**Qué evitaría**', ...avoid.map((item) => `- ${capitalize(item)}`));
  }
  if (brief.avatar && brief.focus.includes('avatar')) {
    lines.push('', '**Tu personaje**', `${brief.avatar.name}: ${lower(brief.avatar.concept)}`);
  }
  lines.push('', '¿En qué estás trabajando ahora mismo? Lo convertimos en la primera pieza.');
  return lines.join('\n').trim();
}

/** "¿Qué hago ahora?": responde desde la dirección del día (solo hechos que ya contiene). */
export function composeDailyReply(daily: DailyBriefContext): string {
  const lines = [daily.summary];
  if (daily.priorities.length) {
    lines.push('', '**Por dónde empezaría**');
    daily.priorities.forEach((priority, index) =>
      lines.push(`- ${index + 1}. ${priority.title}: ${lower(priority.rationale)}`),
    );
  }
  if (daily.warnings.length) {
    lines.push(
      '',
      '**Lo que se está quedando atrás**',
      ...daily.warnings.map((warning) => `- ${warning}`),
    );
  }
  if (daily.content) lines.push('', `**Contenido**: ${daily.content}.`);
  if (daily.stale) {
    lines.push(
      '',
      'Ojo: tu trabajo cambió desde esta dirección. Actualízala en Inicio para verla al día.',
    );
  }
  lines.push(
    '',
    'No puedo marcar tareas como hechas desde aquí: hazlo en Tareas y actualiza la dirección.',
  );
  return lines.join('\n');
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * "¿Cómo vamos?" en Enterprise: responde SOLO con los conteos del estado operativo. No nombra
 * proyectos, campañas ni tareas (no los conoce) y lo dice en lugar de inventarlos.
 */
export function composeOperationsReply(brand: string, ops: OperationsStatusContext): string {
  const empty =
    ops.activeProjects + ops.openTasks + ops.activeContentItems + ops.activeCampaigns === 0;
  const lines = empty
    ? [
        `Todavía no veo trabajo registrado para ${brand}: no hay proyectos activos, tareas pendientes ni contenido en curso.`,
      ]
    : [
        `Así está el trabajo de ${brand} ahora mismo:`,
        '',
        `- ${plural(ops.activeCampaigns, 'campaña activa', 'campañas activas')}${ops.campaigns.length ? `: ${ops.campaigns.map((campaign) => `«${campaign.name}»`).join(', ')}` : ''}`,
        `- ${plural(ops.activeProjects, 'proyecto activo', 'proyectos activos')}`,
        `- ${plural(ops.openTasks, 'tarea pendiente', 'tareas pendientes')}${ops.overdueTasks ? ` (${ops.overdueTasks} vencidas)` : ''}`,
        `- ${plural(ops.activeContentItems, 'pieza de contenido en curso', 'piezas de contenido en curso')}`,
      ];
  lines.push(
    '',
    'Desde el chat solo veo estos conteos, no el detalle de cada campaña, proyecto o tarea: para eso, abre Campañas, Proyectos, Tareas o Contenido.',
  );
  return lines.join('\n');
}

export class DemoProvider implements AIProvider {
  readonly name = 'demo';
  readonly model = 'pixel-demo-1';
  readonly mode = 'demo' as const;

  private meta(start: number): AIResultMeta {
    return {
      provider: this.name,
      model: this.model,
      mode: this.mode,
      latencyMs: Date.now() - start,
    };
  }

  async generateText(input: GenerateTextInput) {
    const start = Date.now();
    const request =
      [...input.messages].reverse().find((turn) => turn.role === 'user')?.content ?? '';
    const personal = extractPersonalBrief(input.system);
    const brief = personal ? null : extractBrief(input.system);
    const daily =
      personal && DAILY_QUESTION.test(request) ? extractDailyBriefContext(input.system) : null;
    const operations =
      brief && OPERATIONS_QUESTION.test(request)
        ? extractOperationsStatusContext(input.system)
        : null;
    const text = daily
      ? composeDailyReply(daily)
      : brief && operations
        ? composeOperationsReply(brief.brand, operations)
        : personal
          ? composePersonalReply(personal, request)
          : brief
            ? composeCreativeReply(brief, request)
            : 'Estoy en modo demo y no tengo contexto para responder a eso.';
    return { text, ...this.meta(start) };
  }

  /**
   * Solo el plan de contenido y la estrategia de campaña tienen versión demo (compuesta con reglas a partir del contexto real,
   * marcada `mode: demo`). Cualquier otra salida estructurada exige un modelo real.
   */
  async generateStructuredOutput<T>(
    input: GenerateStructuredInput<T>,
  ): Promise<{ data: T } & AIResultMeta> {
    const start = Date.now();
    const payload =
      input.schemaName === PLANNING_SCHEMA_NAME ? extractPlanningPayload(input.prompt) : null;
    if (payload) {
      return { data: input.schema.parse(composeDemoContentPlan(payload)), ...this.meta(start) };
    }
    const campaign =
      input.schemaName === CAMPAIGN_SCHEMA_NAME ? extractCampaignPayload(input.prompt) : null;
    if (campaign) {
      return {
        data: input.schema.parse(composeDemoCampaignStrategy(campaign)),
        ...this.meta(start),
      };
    }
    throw new AIProviderError(
      'misconfigured',
      `El proveedor demo no genera salidas estructuradas (${input.schemaName}); configura un proveedor de IA`,
    );
  }
}
