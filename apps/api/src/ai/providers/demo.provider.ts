import type {
  AIProvider,
  AIResultMeta,
  GenerateStructuredInput,
  GenerateTextInput,
} from '../AIProvider.js';
import { extractBrief, type CreativeBrief, type CreativeLever } from '../brief.js';
import { AIProviderError } from '../errors.js';

/**
 * Proveedor local sin IA, para desarrollo sin credenciales y para tests deterministas.
 * Compone una propuesta creativa a partir del brief de marca (palancas, tono, formatos,
 * restricciones). No sustituye a un modelo: sirve para recorrer el producto de punta a punta.
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
    const brief = extractBrief(input.system);
    const request =
      [...input.messages].reverse().find((turn) => turn.role === 'user')?.content ?? '';
    const text = brief
      ? composeCreativeReply(brief, request)
      : 'Estoy en modo demo y no tengo contexto de marca para responder a eso.';
    return { text, ...this.meta(start) };
  }

  async generateStructuredOutput<T>(
    input: GenerateStructuredInput<T>,
  ): Promise<{ data: T } & AIResultMeta> {
    throw new AIProviderError(
      'misconfigured',
      `El proveedor demo no genera salidas estructuradas (${input.schemaName}); configura un proveedor de IA`,
    );
  }
}
