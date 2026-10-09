import type { GeneratedCampaignStrategy } from '@pixel/contracts';
import type { CampaignPayload } from '../campaignStrategyPayload.js';

/*
 * Estrategia de campaña del proveedor DEMO (desarrollo sin credenciales y tests). No es un modelo:
 * compone la estrategia con reglas a partir del ADN REAL de la marca y del brief (origen,
 * diferenciadores, tensiones de la audiencia, arquetipo, tono, lenguaje visual y restricciones).
 * Sin cifras, clientes, claims ni nombres propios inventados: solo palabras del contexto. Por eso dos
 * marcas distintas con el mismo objetivo producen campañas distintas. Rota la palanca creativa si
 * una campaña reciente o una versión anterior ya usó el mismo concepto. Queda marcada `mode: demo`.
 */

type Brand = CampaignPayload['brand'];
type Brief = CampaignPayload['brief'];

interface Lever {
  id: string;
  /** Concepto creativo (corto). */
  concept: string;
  bigIdea: string;
  /** Segunda mitad del mensaje principal. */
  message: string;
  /** Por qué representa a la marca (parte del rationale). */
  reason: string;
  pillar: string;
}

const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase('es');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Recorta a `max` caracteres sin partir palabras (los límites del schema son estrictos). */
function fit(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[,;:]$/, '')}…`;
}

const items = (values: string[], maxItems: number, maxChars: number) =>
  unique(values)
    .map((value) => fit(value, maxChars))
    .filter((value) => value.length >= 2)
    .slice(0, maxItems);

/** Postura creativa de cada arquetipo (sin nombres propios ni cifras). */
const ARCHETYPE_LEVER: Record<string, { concept: string; idea: string }> = {
  creator: { concept: 'el oficio a la vista', idea: 'mostrar cómo se hace, paso a paso' },
  caregiver: { concept: 'las manos detrás', idea: 'poner a las personas en el centro' },
  explorer: { concept: 'la ruta', idea: 'invitar a descubrir y cerrar cada pieza con un hallazgo' },
  sage: { concept: 'lo que nadie explica', idea: 'enseñar algo útil y comprobable' },
  hero: { concept: 'el reto', idea: 'plantear un reto real y resolverlo a la vista' },
  magician: {
    concept: 'antes y después',
    idea: 'mostrar la transformación y lo que la hizo posible',
  },
  rebel: { concept: 'contra la norma', idea: 'nombrar la convención de la categoría y romperla' },
  lover: { concept: 'despacio', idea: 'apostar por lo sensorial y el detalle' },
  jester: { concept: 'sin tanta seriedad', idea: 'usar el humor para decir algo verdadero' },
  everyman: { concept: 'como en casa', idea: 'hablar desde lo cotidiano, sin pretensiones' },
  ruler: { concept: 'hecho para durar', idea: 'demostrar solidez con procesos visibles' },
  innocent: { concept: 'simple', idea: 'una idea clara y optimista, sin ruido' },
};

function leversOf(brand: Brand, product: string): Lever[] {
  const levers: Lever[] = [];
  if (brand.origin) {
    levers.push({
      id: 'origin',
      concept: 'Del origen a la mesa',
      bigIdea: `Que ${product} demuestre de dónde viene: ${brand.origin} como prueba visible, no como dato de la etiqueta.`,
      message: `el mismo origen de ${brand.origin}`,
      reason: `el origen de la marca (${brand.origin})`,
      pillar: 'Origen',
    });
  }
  for (const differentiator of brand.differentiators.slice(0, 2)) {
    levers.push({
      id: `differentiator:${differentiator}`,
      concept: `${capitalize(differentiator)}, a la vista`,
      bigIdea: `Convertir «${lower(differentiator)}» en algo que el público pueda ver y comprobar en cada pieza de ${product}.`,
      message: `${lower(differentiator)}, comprobable`,
      reason: `su diferenciador «${lower(differentiator)}»`,
      pillar: capitalize(differentiator),
    });
  }
  const [problem] = brand.audience.problems;
  const [need] = brand.audience.needs;
  if (problem && need) {
    levers.push({
      id: 'tension',
      concept: `Sin ${lower(problem)}`,
      bigIdea: `Partir de una frustración real del público («${lower(problem)}») y responder con lo que de verdad busca: ${lower(need)}.`,
      message: `${lower(need)}, sin ${lower(problem)}`,
      reason: `la tensión entre «${lower(problem)}» y «${lower(need)}»`,
      pillar: capitalize(need),
    });
  }
  const archetype = ARCHETYPE_LEVER[brand.archetype.id] ?? ARCHETYPE_LEVER.creator!;
  levers.push({
    id: 'archetype',
    concept: capitalize(archetype.concept),
    bigIdea: `Contar ${product} como lo haría el arquetipo ${lower(brand.archetype.name)}: ${archetype.idea}.`,
    message: archetype.concept,
    reason: `su arquetipo (${lower(brand.archetype.name)})`,
    pillar: capitalize(archetype.concept),
  });
  for (const element of brand.visual.recurringElements.slice(0, 1)) {
    levers.push({
      id: `element:${element}`,
      concept: `${capitalize(element)} como hilo`,
      bigIdea: `Usar ${lower(element)}, un elemento propio de la marca, como hilo visual que une todas las piezas de ${product}.`,
      message: `${lower(element)} en cada pieza`,
      reason: `un elemento propio de su lenguaje visual (${lower(element)})`,
      pillar: capitalize(element),
    });
  }
  return levers;
}

const ROLE_WORDS: Record<string, string> = {
  primary: 'principal, domina la composición',
  secondary: 'secundario, acompaña',
  accent: 'acento: solo en detalles, nunca dominante',
  neutral: 'neutro: fondos y respiro',
  support: 'de apoyo',
};

const SHAPE_WORDS: Record<string, string> = {
  organic: 'formas orgánicas y bordes suaves',
  soft: 'formas suaves y redondeadas',
  fluid: 'formas fluidas y continuas',
  geometric: 'retícula clara y formas geométricas precisas',
  structural: 'composición estructural y ortogonal',
  mixed: 'equilibrio entre formas orgánicas y geométricas',
};

const SOCIAL = /instagram|facebook|tik ?tok/i;
const RETAIL = /punto de venta|tienda|retail|pos\b/i;
const PROFESSIONAL = /linkedin/i;
const WEB = /\bweb\b|sitio|landing|p[aá]gina/i;

/** Canales: los del brief; si no hay, una sugerencia justificada por el ADN (no una lista fija). */
function channelsFor(requested: Brief['channels'], payload: CampaignPayload) {
  if (requested.length) return { channels: requested, suggested: false };
  const formal = payload.brand.communication.formality >= 4;
  return {
    channels: formal ? ['LinkedIn', 'sitio web'] : ['Instagram'],
    suggested: true,
  };
}

function deliverablesFor(channels: string[], lever: Lever, payload: CampaignPayload) {
  const product = payload.brief.productOrService ?? `la propuesta de ${payload.brand.name}`;
  const list: GeneratedCampaignStrategy['deliverables'] = [];
  const social = channels.filter((channel) => SOCIAL.test(channel));
  for (const channel of channels) {
    // Con varias redes, cada pieza nombra la suya (no son la misma pieza repetida).
    const on = social.length > 1 ? ` para ${channel}` : '';
    if (SOCIAL.test(channel)) {
      list.push(
        {
          title: fit(`Reel de lanzamiento${on} «${lower(lever.concept)}»`, 160),
          description: fit(`Video corto que presenta ${product} desde la idea central.`, 600),
          type: 'content',
          platform: channel,
          format: 'Reel',
          objective: fit(`Presentar ${product} y fijar el concepto`, 300),
          rationale: fit(`Es la pieza que mejor muestra ${lever.reason} en movimiento.`, 500),
        },
        {
          title: fit(`Carrusel${on}: ${lower(lever.pillar)}`, 160),
          description: fit(`Secuencia de imágenes que explica ${lower(lever.message)}.`, 600),
          type: 'content',
          platform: channel,
          format: 'Carrusel',
          objective: 'Explicar el porqué de la campaña',
          rationale: fit(`Permite desarrollar ${lever.reason} con calma.`, 500),
        },
      );
    } else if (PROFESSIONAL.test(channel)) {
      list.push({
        title: fit(`Publicación «${lower(lever.concept)}»`, 160),
        description: fit(`Texto con evidencia concreta de ${lower(lever.message)}.`, 600),
        type: 'content',
        platform: channel,
        format: 'Post',
        objective: fit(`Presentar ${product} a quien decide`, 300),
        rationale: fit(
          `Un público que compara antes de decidir necesita ver ${lever.reason} con hechos.`,
          500,
        ),
      });
    } else if (WEB.test(channel)) {
      list.push({
        title: fit(`Página de lanzamiento de ${product}`, 160),
        description: 'Página que reúne la idea central, la prueba y la llamada a la acción.',
        type: 'web',
        platform: channel,
        format: 'Página',
        objective: 'Concentrar la información de la campaña',
        rationale: fit(`Da un destino único a todas las piezas y a ${lever.reason}.`, 500),
      });
    } else if (RETAIL.test(channel)) {
      list.push({
        title: 'Material para punto de venta',
        description: fit(
          `Pieza impresa que traslada el concepto al lugar de compra de ${product}.`,
          600,
        ),
        type: 'print',
        platform: channel,
        format: 'Impreso',
        objective: 'Reconocer la campaña en el momento de compra',
        rationale:
          'La decisión final ocurre en el punto de venta: el concepto tiene que estar ahí.',
      });
    }
  }
  list.push(
    {
      title: fit(`Pieza gráfica principal «${lower(lever.concept)}»`, 160),
      description: 'Visual de referencia de la campaña: define composición, color y tipografía.',
      type: 'design',
      platform: null,
      format: 'Pieza gráfica',
      objective: 'Fijar la dirección de arte para el resto de piezas',
      rationale: 'Todas las piezas derivan de ella: evita que cada una se vea distinta.',
    },
    {
      title: fit(`Fotografía de ${product}`, 160),
      description: fit(
        `Sesión con ${payload.brand.visual.materials.slice(0, 2).join(' y ') || 'los materiales de la marca'} y luz coherente con la dirección visual.`,
        600,
      ),
      type: 'photo',
      platform: null,
      format: 'Sesión de fotos',
      objective: 'Banco de imágenes propio para la campaña',
      rationale: 'Imágenes reales en lugar de recursos genéricos, como pide el ADN.',
    },
  );
  return list.slice(0, 8);
}

export function composeDemoCampaignStrategy(payload: CampaignPayload): GeneratedCampaignStrategy {
  const { brand, brief } = payload;
  const product = brief.productOrService ?? `la propuesta de ${brand.name}`;
  const used = [
    ...payload.recentCampaigns.map((campaign) => campaign.concept ?? ''),
    ...payload.previousVersions.map((version) => version.concept),
  ].map((value) => value.trim().toLocaleLowerCase('es'));
  const levers = leversOf(brand, product);
  const lever =
    levers.find((candidate) => !used.includes(candidate.concept.toLocaleLowerCase('es'))) ??
    levers[0]!;

  const [problem] = brand.audience.problems;
  const [need] = brand.audience.needs;
  const insight = brief.problem
    ? {
        text: `${capitalize(brief.problem)}: el reto no es solo comunicar, es que se crea.`,
        type: 'brief_derived' as const,
      }
    : problem && need
      ? {
          text: `Quien nos elige no solo busca ${lower(need)}: quiere dejar atrás ${lower(problem)}.`,
          type: 'brand_derived' as const,
        }
      : {
          text: `Podría funcionar mejor mostrar cómo trabajamos que hablar de ${product}.`,
          type: 'strategic_hypothesis' as const,
        };

  const { channels, suggested } = channelsFor(brief.channels, payload);
  const toneKey = (value: string) => value.toLocaleLowerCase('es').replace(/(as|os|a|o|s)$/, '');
  const tone = items([...brand.communication.tone, ...brand.personality.slice(0, 2)], 5, 40).filter(
    (value, index, all) => all.findIndex((other) => toneKey(other) === toneKey(value)) === index,
  );
  const avoid = items(
    [...brand.restrictions.visual, ...brand.dislikes, ...brand.restrictions.creative],
    10,
    160,
  );
  const energy = brand.communication.energy;
  const warm = brand.visual.temperature === 'warm';
  const photographyLikes = brand.likes.filter((like) => /foto|luz|textur|imagen|real/i.test(like));
  const differentiator = brand.differentiators[0];
  const mandatory = brief.mandatoryElements.length
    ? ` Incluye siempre: ${brief.mandatoryElements.join(', ')}.`
    : '';

  return {
    strategicProblem: fit(
      `${brand.name} necesita ${lower(brief.objective)} sin perder lo que la hace reconocible. ${brand.essence}`,
      600,
    ),
    strategicOpportunity: fit(
      `Apoyar la campaña en ${lever.reason} permite diferenciar ${product} sin una comunicación promocional genérica.`,
      600,
    ),
    insight: fit(insight.text, 500),
    insightType: insight.type,
    bigIdea: fit(lever.bigIdea, 300),
    concept: fit(lever.concept, 200),
    campaignNarrative: fit(
      `Empezamos por ${lever.reason}. Lo contamos con un tono ${tone.slice(0, 2).join(' y ') || 'propio'} y lo demostramos con piezas reales de ${product}. Cerramos invitando a probarlo, sin promesas que no podamos sostener.${mandatory}`,
      1500,
    ),
    keyMessage: fit(`${capitalize(product)}: ${lever.message}.`, 200),
    supportingMessages: items(
      [
        ...brand.differentiators.map((statement) => `${capitalize(statement)}.`),
        ...brand.values.slice(0, 2).map((value) => `${capitalize(value)} en cada detalle.`),
        brand.essence,
      ],
      5,
      240,
    ),
    valueProposition: fit(
      differentiator
        ? `${capitalize(product)} con ${lower(differentiator)}.`
        : `${capitalize(product)}, fiel a lo que somos.`,
      400,
    ),
    callToAction: brief.campaignType === 'launch' ? 'Conócelo' : 'Descúbrelo',
    tone: tone.length ? tone : ['cercano'],
    visualDirection: {
      mood: items([...brand.visual.styles, warm ? 'cálido' : 'preciso'], 6, 160),
      colors: items(
        brand.visual.palette.map(
          (color) => `${color.name ?? color.hex} (${ROLE_WORDS[color.role] ?? color.role})`,
        ),
        6,
        160,
      ),
      materials: items(brand.visual.materials, 6, 160),
      composition: items(
        [
          shapeWords(brand),
          ...brand.visual.recurringElements.map((element) => `presencia de ${lower(element)}`),
        ],
        6,
        160,
      ),
      photography: items(
        [
          ...photographyLikes,
          warm
            ? 'luz natural y cálida, producto en primer plano'
            : 'luz controlada y fondos limpios',
        ],
        5,
        160,
      ),
      motion: [energy >= 4 ? 'cortes precisos y ritmo ágil' : 'ritmo pausado y planos largos'],
      avoid,
    },
    channels: items(channels, 8, 60),
    contentPillars: uniquePillars([
      {
        name: fit(lever.pillar, 80),
        purpose: fit(`Sostener la idea central: ${lever.reason}.`, 300),
      },
      ...(brand.values[0]
        ? [
            {
              name: fit(capitalize(brand.values[0]), 80),
              purpose: fit(`Demostrar ${lower(brand.values[0])} con hechos de la marca.`, 300),
            },
          ]
        : []),
      {
        name: 'Producto',
        purpose: fit(`Mostrar ${product} tal como es, sin exagerarlo.`, 300),
      },
    ]),
    deliverables: deliverablesFor(channels, lever, payload),
    rationale: fit(
      `La campaña se apoya en ${lever.reason} porque forma parte del ADN de ${brand.name} y permite diferenciar la marca sin recurrir a ${brand.dislikes[0] ? lower(brand.dislikes[0]) : 'una comunicación promocional agresiva'}.${suggested ? ` El brief no indica canales: sugerimos ${channels.join(' y ')} por el tono y la formalidad de la marca.` : ''}`,
      1200,
    ),
  };
}

function shapeWords(brand: Brand): string {
  const shapes = brand.visual.shapes.join(' ').toLocaleLowerCase('es');
  if (/geom|angul|precis/.test(shapes)) return SHAPE_WORDS.geometric!;
  if (/estruct/.test(shapes)) return SHAPE_WORDS.structural!;
  if (/redond|org[aá]nic|suave/.test(shapes)) return SHAPE_WORDS.organic!;
  return SHAPE_WORDS.mixed!;
}

function uniquePillars(pillars: { name: string; purpose: string }[]) {
  return pillars.filter(
    (pillar, index) =>
      pillars.findIndex(
        (other) => other.name.toLocaleLowerCase('es') === pillar.name.toLocaleLowerCase('es'),
      ) === index,
  );
}
