import {
  BRAND_ARCHETYPES,
  type AvatarProfile,
  type BrandArchetype,
  type BrandDna,
  type MessageRole,
} from '@pixel/contracts';
import type { AIChatTurn } from '../../ai/index.js';
import {
  renderBrief,
  type CreativeBrief,
  type CreativeLever,
  type PersonalBrief,
} from '../../ai/brief.js';

/*
 * Composición del contexto Enterprise: el prompt con el que habla el Pixel de UNA marca.
 *
 * Función pura: recibe datos ya cargados por el EnterpriseContextBuilder (context/), todos del
 * mismo workspace, y nunca consulta la base de datos, así que no puede mezclar información de
 * otros workspaces. No recita el ADN: lo convierte en criterio (palancas creativas, postura del
 * arquetipo, límites) e instruye al modelo para razonar con él en lugar de repetirlo.
 */

export interface HistoryMessage {
  role: MessageRole;
  content: string;
}

export interface PixelContextInput {
  company: { name: string };
  brandDna: BrandDna;
  avatar: AvatarProfile | null;
  /** Memorias creativas activas del workspace (más recientes primero). Vacío = no se menciona. */
  memories?: string[];
  /** Mensajes previos de ESTA conversación, del más antiguo al más reciente. */
  history: HistoryMessage[];
  userMessage: string;
  limits?: Partial<ContextLimits>;
}

export interface ContextLimits {
  historyMessages: number;
  historyChars: number;
  listItems: number;
  itemChars: number;
}

export const DEFAULT_LIMITS: ContextLimits = {
  historyMessages: 20,
  historyChars: 12_000,
  listItems: 5,
  itemChars: 180,
};

export interface PixelContext<Brief = CreativeBrief | PersonalBrief> {
  system: string;
  messages: AIChatTurn[];
  /** Brief de marca (Enterprise) o personal (Personal), según la estrategia que lo construyó. */
  brief: Brief;
  stats: {
    historyMessages: number;
    historyChars: number;
    systemChars: number;
    includesAvatar: boolean;
    memories: number;
  };
}

// ---------- Relevancia ----------

const FOCUS_PATTERNS: [string, RegExp][] = [
  ['social', /\b(redes|social|instagram|tiktok|linkedin|post|reel|stories|contenido)/i],
  ['campaign', /\b(campa[nñ]a|publicidad|anuncio|promo|activaci)/i],
  ['launch', /\b(lanz|lanzar|nuevo producto|producto nuevo|estreno|presentar)/i],
  ['naming', /\b(nombre|naming|eslogan|slogan|tagline|claim|frase)/i],
  [
    'visual',
    /\b(logo|visual|color|paleta|dise[nñ]|imagen|foto|empaque|packaging|estilo|est[eé]tica)/i,
  ],
  ['avatar', /\b(pixel|personaje|avatar|mascota)/i],
  ['audience', /\b(cliente|p[uú]blico|audiencia|segmento|comprador)/i],
];

export function detectFocus(message: string): string[] {
  const focus = FOCUS_PATTERNS.filter(([, pattern]) => pattern.test(message)).map(([name]) => name);
  return focus.length ? focus : ['general'];
}

// ---------- Criterio creativo ----------

/** Cómo aborda cada arquetipo una idea creativa (postura, no atributos). */
const ARCHETYPE_STANCE: Record<BrandArchetype, { title: string; stance: string }> = {
  creator: {
    title: 'El proceso',
    stance: 'Mostramos el oficio y el proceso: la calidad se ve en cómo se hacen las cosas.',
  },
  caregiver: {
    title: 'Las manos detrás',
    stance:
      'Ponemos a las personas en el centro: quién hace, quién recibe y el cuidado entre ambos.',
  },
  explorer: {
    title: 'La ruta',
    stance: 'Invitamos a descubrir: cada pieza es un viaje con un hallazgo al final.',
  },
  sage: {
    title: 'Lo que nadie explica',
    stance: 'Enseñamos algo útil y claro; ganamos confianza explicando, no prometiendo.',
  },
  hero: {
    title: 'El reto',
    stance: 'Planteamos un reto real y mostramos cómo lo superamos con resultados.',
  },
  magician: {
    title: 'Antes y después',
    stance: 'Mostramos la transformación: el antes, el después y lo que lo hizo posible.',
  },
  rebel: {
    title: 'Contra la norma',
    stance: 'Nombramos la convención de la categoría y la rompemos a propósito.',
  },
  lover: {
    title: 'Despacio',
    stance: 'Apostamos por lo sensorial y el detalle: que se sienta antes de que se entienda.',
  },
  jester: {
    title: 'Sin tanta seriedad',
    stance: 'Usamos el humor para decir algo verdadero de la categoría.',
  },
  everyman: {
    title: 'Como en casa',
    stance: 'Hablamos desde lo cotidiano y la comunidad, sin pretensiones.',
  },
  ruler: {
    title: 'Hecho para durar',
    stance: 'Demostramos solidez con evidencia: procesos, cumplimiento y trabajo terminado.',
  },
  innocent: {
    title: 'Simple',
    stance: 'Lo hacemos simple y optimista: una idea clara, sin ruido.',
  },
};

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);

function buildLevers(dna: BrandDna, focus: string[]): CreativeLever[] {
  const levers: CreativeLever[] = [];
  const stance = ARCHETYPE_STANCE[dna.archetypes.primary.id];
  const recurring = dna.visualLanguage.recurringElements;
  const [problem] = dna.audience.problems;
  const [need] = dna.audience.needs;

  if (dna.identity.origin) {
    levers.push({
      id: 'origin',
      title: `Desde ${dna.identity.origin}`,
      idea: `Contar el origen (${dna.identity.origin}) como la razón de ser de lo que hacemos, no como un dato de la etiqueta.`,
      proof: `Mostrar el lugar y a las personas reales${recurring[0] ? `, con ${recurring[0].toLocaleLowerCase('es')} como hilo visual` : ''}.`,
    });
  }
  for (const differentiator of dna.differentiators.statements.slice(0, 2)) {
    levers.push({
      id: `differentiator:${differentiator}`,
      title: capitalize(differentiator),
      idea: `Convertir «${differentiator}» en algo que el público pueda ver y comprobar.`,
      proof: 'Demostrarlo en pantalla en lugar de afirmarlo.',
    });
  }
  if (problem && need) {
    levers.push({
      id: 'tension',
      title: `Sin ${problem.toLocaleLowerCase('es')}`,
      idea: `Partir de una frustración real del público («${problem}») y resolverla con lo que de verdad busca («${need}»).`,
      proof: 'Abrir cada pieza con la frustración reconocible y cerrar con nuestra respuesta.',
    });
  }
  levers.push({
    id: 'archetype',
    title: stance.title,
    idea: stance.stance,
    proof: `Que se note en la forma de contar, no en adjetivos sobre la marca.`,
  });

  // La petición decide el orden: en lanzamientos y campañas manda el origen o el diferenciador.
  if (focus.includes('audience') || focus.includes('social')) {
    levers.sort((a, b) => Number(b.id === 'tension') - Number(a.id === 'tension'));
  }
  if (focus.includes('launch') || focus.includes('campaign')) {
    levers.sort((a, b) => Number(b.id === 'origin') - Number(a.id === 'origin'));
  }
  return levers;
}

/** Últimos mensajes que caben en los límites, empezando siempre por un turno del usuario. */
export function trimHistory(history: HistoryMessage[], limits: ContextLimits): AIChatTurn[] {
  const recent = history.slice(-limits.historyMessages);
  const kept: AIChatTurn[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const message = recent[i]!;
    if (chars + message.content.length > limits.historyChars) break;
    chars += message.content.length;
    kept.unshift({
      role: message.role === 'pixel' ? 'assistant' : 'user',
      content: message.content,
    });
  }
  // Los turnos deben empezar por el usuario.
  while (kept[0]?.role === 'assistant') kept.shift();
  return kept;
}

const list = (items: string[], limits: ContextLimits) =>
  items.slice(0, limits.listItems).map((item) => truncate(item, limits.itemChars));

export function buildPixelContext(input: PixelContextInput): PixelContext<CreativeBrief> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const { brandDna: dna, avatar } = input;
  const focus = detectFocus(input.userMessage);
  const archetype = BRAND_ARCHETYPES[dna.archetypes.primary.id];
  const includesAvatar = Boolean(avatar && (focus.includes('avatar') || focus.includes('visual')));
  const c = dna.communication;

  const brief: CreativeBrief = {
    brand: input.company.name,
    industry: dna.identity.industry,
    essence: dna.identity.essence,
    origin: dna.identity.origin,
    purpose: truncate(dna.purpose.purpose, 300),
    values: list(dna.purpose.values, limits),
    audience: {
      summary: truncate(dna.audience.summary, 300),
      needs: list(dna.audience.needs, limits),
      problems: list(dna.audience.problems, limits),
    },
    personality: list(
      dna.personality.traits.map((trait) => trait.label),
      limits,
    ),
    archetype: {
      id: dna.archetypes.primary.id,
      name: archetype.name,
      stance: ARCHETYPE_STANCE[dna.archetypes.primary.id].stance,
    },
    tone: {
      traits: c.tone,
      formality: c.formality.level,
      energy: c.energy.level,
      language: c.language.name,
    },
    vocabulary: {
      use: list(c.vocabulary.preferred, limits),
      avoid: list(c.vocabulary.avoid, limits),
    },
    visual: {
      styles: list(dna.visualLanguage.styles, limits),
      materials: list(dna.visualLanguage.materials, limits),
      recurring: list(dna.visualLanguage.recurringElements, limits),
      palette: dna.visualLanguage.palette
        .slice(0, 5)
        .map((color) => `${color.name ?? color.hex} (${color.role})`),
      temperature: { warm: 'cálida', cool: 'fría', neutral: 'neutra' }[
        dna.visualLanguage.temperature
      ],
    },
    differentiators: list(dna.differentiators.statements, limits),
    likes: list(dna.creativePreferences.likes, limits),
    dislikes: list(dna.creativePreferences.dislikes, limits),
    restrictions: list([...dna.restrictions.creative, ...dna.restrictions.visual], limits),
    focus,
    levers: buildLevers(dna, focus),
    avatar:
      includesAvatar && avatar
        ? { name: avatar.name, concept: avatar.concept, personality: avatar.personalityTraits }
        : null,
  };

  const levers = brief.levers
    .map((lever, i) => `${i + 1}. «${lever.title}»: ${lever.idea} ${lever.proof}`)
    .join('\n');
  const memories = list(input.memories ?? [], limits);
  const guidelines = [...c.guidelines.do, ...c.guidelines.dont.map((rule) => `Nunca: ${rule}`)]
    .map((rule) => `- ${rule}`)
    .join('\n');

  const system = `Eres Pixel, el director creativo de ${input.company.name}. No eres un asistente genérico: formas parte del equipo y hablas en primera persona del plural («nosotros», «nuestra marca»).

Cómo trabajas:
- Piensa como director creativo: propone una idea concreta con un concepto central, por qué funciona para nosotros frente a la opción obvia, y cómo se ejecuta.
- Usa el ADN de la marca como criterio, no como contenido. Nunca describas la marca ni enumeres sus rasgos («somos artesanales y cercanos»): haz que esos rasgos se noten en el ángulo, los formatos, las imágenes y las palabras.
- Aterriza: piezas y formatos concretos, un ejemplo breve de copy en nuestra voz y qué evitaríamos.
- Respeta siempre las restricciones. No inventes datos de la empresa (precios, cifras, premios, clientes, fechas) que no estén en el contexto.
- Si falta algo imprescindible, propone primero y termina con una sola pregunta concreta.
- Sé conciso: unas 220 palabras salvo que te pidan más. Usa títulos cortos en **negrita** y viñetas con «- ».
- Solo conoces esta marca. Si te preguntan por otras empresas o por información que no tienes, dilo con naturalidad.

Cómo hablamos (${c.language.name}, tono ${c.tone.join(', ')}; formalidad ${c.formality.label.toLocaleLowerCase('es')}, energía ${c.energy.label.toLocaleLowerCase('es')}):
${guidelines}

Ejemplo de criterio (marca ficticia, solo para ilustrar la diferencia):
- Mal: «Somos innovadores y cercanos, así que hagamos un post contándolo.»
- Bien: «Mostremos en 15 segundos el antes y el después de un cliente real: la innovación se demuestra, no se declara.»

Palancas creativas de ${input.company.name} (puntos de partida; elige, combina o descarta según la petición):
${levers}
${brief.avatar ? `\nNuestro personaje, ${brief.avatar.name}: ${brief.avatar.concept} Personalidad: ${brief.avatar.personality.join(', ')}. Úsalo si ayuda a la idea.\n` : ''}${memories.length ? `\nLo que ya decidimos juntos (memoria creativa; respétalo):\n${memories.map((memory) => `- ${memory}`).join('\n')}\n` : ''}
Contexto de marca (referencia para razonar; no lo cites literalmente):
${renderBrief(brief)}`;

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
