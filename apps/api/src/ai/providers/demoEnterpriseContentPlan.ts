import {
  CONTENT_PLATFORM_LABELS,
  type ContentAngle,
  type ContentFormat,
  type ContentPlatform,
  type ContentStrategicRole,
  type GeneratedEnterpriseContentPlan,
} from '@pixel/contracts';
import type { EnterprisePlanningPayload } from '../enterprisePlanningPayload.js';

/*
 * Plan editorial del proveedor DEMO para una marca (desarrollo sin credenciales y tests). No es un
 * modelo: compone el plan con reglas a partir del contexto REAL.
 *
 * - La LÓGICA editorial sale del arquetipo del BrandDNA (no solo los sustantivos): una marca de
 *   cuidado (caregiver, everyman…) cuenta desde las personas y el oficio; una de método (sage,
 *   creator, ruler…) demuestra con proceso y evidencia; una de búsqueda (explorer, hero, rebel)
 *   plantea retos y recorridos. Cambian títulos, conceptos, hooks, ángulos y el porqué de marca.
 * - Con campaña, las fuentes son la estrategia: piezas pendientes, pilares, mensajes y proyectos de
 *   la campaña. Sin campaña, los diferenciadores, tensiones, valores y elementos del ADN.
 * - Sin cifras, claims ni nombres propios inventados. Queda marcado `mode: demo`.
 */

type Payload = EnterprisePlanningPayload;
type Item = GeneratedEnterpriseContentPlan['items'][number];
type Voice = 'craft' | 'method' | 'quest';

const VOICE_OF: Record<string, Voice> = {
  caregiver: 'craft',
  everyman: 'craft',
  lover: 'craft',
  innocent: 'craft',
  jester: 'craft',
  creator: 'method',
  sage: 'method',
  ruler: 'method',
  magician: 'method',
  explorer: 'quest',
  hero: 'quest',
  rebel: 'quest',
};

/** Por qué la ejecución pertenece a la marca, según su voz. */
const VOICE_REASON: Record<Voice, string> = {
  craft: 'la marca cuenta desde las personas y el cuidado, no desde el producto',
  method: 'la marca demuestra con proceso y evidencia, no con adjetivos',
  quest: 'la marca invita a recorrer el camino, no a mirar el resultado',
};

const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const fit = (value: string, max: number) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[,;:]$/, '')}…`;
};
const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

// Similitud por palabras clave, más estricta que la del grounding (0,6): el demo no debe proponer
// algo que el grounding vaya a descartar por repetir el historial.
const FILLER = new Set([
  'del',
  'las',
  'los',
  'una',
  'que',
  'con',
  'por',
  'sin',
  'mas',
  'para',
  'como',
]);
const keyWords = (value: string) =>
  new Set(
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter((word) => word.length >= 3 && !FILLER.has(word))
      .map((word) => (word.length > 5 ? word.replace(/(as|os|es|a|o|e|s)$/, '') : word)),
  );
const tooSimilar = (a: string, b: string) => {
  if (same(a, b)) return true;
  const x = keyWords(a);
  const y = keyWords(b);
  if (x.size === 0 || y.size === 0) return false;
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / (x.size + y.size - shared) >= 0.45;
};

/**
 * Encuadres de las vueltas siguientes (planes nuevos sobre la misma campaña o marca): cambian el
 * punto de vista de la pieza, no solo el formato, para que un segundo plan no repita el primero.
 */
const FRAMES: Record<Voice, ((x: string) => { title: string; hook: string })[]> = {
  craft: [
    (x) => ({
      title: `Quién está detrás de ${lower(x)}`,
      hook: `${capitalize(x)}, contado por quien lo hace.`,
    }),
    (x) => ({
      title: `${capitalize(x)}: lo que no se ve`,
      hook: `Lo que pasa antes de ${lower(x)}.`,
    }),
    (x) => ({ title: `Una mañana con ${lower(x)}`, hook: `Empieza temprano: ${lower(x)}.` }),
    (x) => ({
      title: `${capitalize(x)}, en primera persona`,
      hook: `Te lo cuenta quien lo cuida: ${lower(x)}.`,
    }),
  ],
  method: [
    (x) => ({
      title: `${capitalize(x)}: preguntas y respuestas`,
      hook: `Tres dudas sobre ${lower(x)}, resueltas.`,
    }),
    (x) => ({
      title: `Antes y después: ${lower(x)}`,
      hook: `Así cambió ${lower(x)} entre versiones.`,
    }),
    (x) => ({ title: `${capitalize(x)}, en tres pasos`, hook: `Paso uno de ${lower(x)}.` }),
    (x) => ({ title: `Qué aprendimos con ${lower(x)}`, hook: `Lo que ${lower(x)} nos enseñó.` }),
  ],
  quest: [
    (x) => ({ title: `${capitalize(x)}: el siguiente paso`, hook: `Seguimos: ${lower(x)}.` }),
    (x) => ({
      title: `Lo que encontramos en ${lower(x)}`,
      hook: `Fuimos a buscar ${lower(x)} y esto apareció.`,
    }),
    (x) => ({ title: `${capitalize(x)}, sin atajos`, hook: `No hay atajo para ${lower(x)}.` }),
    (x) => ({
      title: `Hasta dónde llega ${lower(x)}`,
      hook: `Llevamos ${lower(x)} un poco más lejos.`,
    }),
  ],
};

const FORMATS: Record<ContentPlatform, ContentFormat[]> = {
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

type Kind =
  | 'deliverable'
  | 'pillar'
  | 'message'
  | 'project'
  | 'differentiator'
  | 'tension'
  | 'value'
  | 'element';

interface Source {
  kind: Kind;
  label: string;
  /** Texto de apoyo (propósito del pilar…). */
  detail?: string;
  /** Pilar al que pertenece (con campaña: uno de los de la estrategia). */
  pillar?: string;
  deliverableRef?: string;
  projectRef?: string;
  format?: string | null;
}

interface Template {
  title: string;
  concept: string;
  hook: string;
  angle: ContentAngle;
  role: ContentStrategicRole;
  objective: string;
  rationale: string;
  /** Rasgo del ADN o de la campaña en que se apoya (para el porqué de marca). */
  trait: string;
}

function templateFor(voice: Voice, source: Source, payload: Payload): Template {
  const { brand, campaign } = payload;
  const x = source.label;
  const lx = lower(x);
  const concept = campaign?.strategy.concept;
  switch (source.kind) {
    case 'deliverable':
      return {
        title:
          concept && !x.toLocaleLowerCase('es').includes(concept.toLocaleLowerCase('es'))
            ? `${x} — ${lower(concept)}`
            : x,
        concept: `Desarrolla la pieza de campaña «${x}»${concept ? ` alrededor de «${lower(concept)}»` : ''}.`,
        hook: campaign?.strategy.keyMessage ?? capitalize(x),
        angle: 'storytelling',
        role: campaign && /lanz/i.test(campaign.objective) ? 'launch' : 'awareness',
        objective: `Llevar a contenido la idea central de la campaña: ${lower(concept ?? campaign?.objective ?? x)}`,
        rationale: 'Es una pieza que la campaña necesita y aún no está en producción.',
        trait: 'una pieza que la campaña necesita',
      };
    case 'pillar': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'concept' | 'hook' | 'angle'>> = {
        craft: {
          title: `${capitalize(x)}, contado de cerca`,
          concept: `Desarrolla el pilar «${x}» desde las personas que lo hacen posible${concept ? `, siempre dentro de «${lower(concept)}»` : ''}.`,
          hook: `${capitalize(x)} empieza mucho antes de lo que ves.`,
          angle: 'behind_the_scenes',
        },
        method: {
          title: `${capitalize(x)}: cómo se hace`,
          concept: `Explica paso a paso el pilar «${x}»${concept ? ` como prueba de «${lower(concept)}»` : ''}.`,
          hook: `${capitalize(x)}, paso a paso: así funciona.`,
          angle: 'process',
        },
        quest: {
          title: `${capitalize(x)}: el recorrido`,
          concept: `Acompaña el pilar «${x}» como un recorrido con un hallazgo al final${concept ? `, dentro de «${lower(concept)}»` : ''}.`,
          hook: `Vamos a donde empieza ${lx}.`,
          angle: 'storytelling',
        },
      };
      return {
        ...byVoice[voice],
        role: 'awareness',
        objective: fit(`Desarrollar el pilar «${x}»: ${lower(source.detail ?? x)}`, 300),
        rationale: `Pertenece a un pilar de la estrategia de campaña.`,
        trait: `el pilar «${x}» de la campaña`,
      };
    }
    case 'message': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'concept' | 'angle'>> = {
        craft: {
          title: `${capitalize(lx.replace(/\.$/, ''))}, en una imagen`,
          concept: `Una pieza sensorial que hace sentir el mensaje «${x}» sin explicarlo.`,
          angle: 'reflection',
        },
        method: {
          title: `${capitalize(lx.replace(/\.$/, ''))}, explicado`,
          concept: `Demuestra el mensaje «${x}» con una comparación clara de antes y después.`,
          angle: 'comparison',
        },
        quest: {
          title: `${capitalize(lx.replace(/\.$/, ''))}: el porqué`,
          concept: `Defiende el mensaje «${x}» frente a la forma habitual de hacer las cosas.`,
          angle: 'opinion',
        },
      };
      return {
        ...byVoice[voice],
        hook: x,
        role: 'education',
        objective: fit(`Fijar el mensaje «${x.replace(/\.$/, '')}»`, 300),
        rationale: 'Desarrolla uno de los mensajes de la estrategia.',
        trait: 'un mensaje de la estrategia de campaña',
      };
    }
    case 'project': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'hook' | 'angle'>> = {
        craft: {
          title: `Detrás de ${lx}`,
          hook: `Así estamos haciendo ${lx}, con nuestras manos.`,
          angle: 'behind_the_scenes',
        },
        method: {
          title: `Iteración a iteración: ${lx}`,
          hook: `${capitalize(lx)}: primera versión, ajuste, siguiente versión.`,
          angle: 'process',
        },
        quest: {
          title: `En ruta: ${lx}`,
          hook: `${capitalize(lx)} todavía no está terminado. Acompáñanos.`,
          angle: 'storytelling',
        },
      };
      return {
        ...byVoice[voice],
        concept: `Muestra el avance real del proyecto «${x}»: qué se hizo, qué cambió y por qué.`,
        role: 'authority',
        objective: `Mostrar el proceso real detrás de «${x}»`,
        rationale: `Convierte trabajo real de ${brand.name} en contenido: el proceso es la prueba.`,
        trait: 'trabajo real de la marca',
      };
    }
    case 'differentiator': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'concept' | 'hook' | 'angle'>> = {
        craft: {
          title: `Las manos detrás de: ${lx}`,
          concept: `Quiénes hacen posible ${lx} y cómo lo cuidan, contado de cerca.`,
          hook: `Antes de llegar a ti, ${lx} pasa por muchas manos.`,
          angle: 'behind_the_scenes',
        },
        method: {
          title: `Prueba: ${lx}`,
          concept: `Documenta en pantalla cómo se consigue ${lx}: qué se revisa y qué se ajusta.`,
          hook: `${capitalize(lx)} no es una promesa: es el proceso, paso a paso.`,
          angle: 'process',
        },
        quest: {
          title: `El reto: ${lx}`,
          concept: `Plantea ${lx} como un reto real y muestra cómo se supera.`,
          hook: `Nos pusimos un reto: ${lx}. Así lo resolvimos.`,
          angle: 'case',
        },
      };
      return {
        ...byVoice[voice],
        role: 'authority',
        objective: `Demostrar ${lx} con evidencia visible`,
        rationale: `Es un diferenciador del ADN: se gana confianza enseñándolo, no prometiéndolo.`,
        trait: `su diferenciador «${lx}»`,
      };
    }
    case 'tension': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'concept' | 'hook' | 'angle'>> = {
        craft: {
          title: `Lo contrario de ${lx}`,
          concept: `Contrapone ${lx} con el cuidado que pone ${brand.name} en cada paso.`,
          hook: `Frente a ${lx}, otra manera de hacer las cosas.`,
          angle: 'storytelling',
        },
        method: {
          title: `Por qué pasa: ${lx}`,
          concept: `Explica la causa de ${lx} y cómo la resuelve el método de ${brand.name}.`,
          hook: `${capitalize(lx)} tiene una causa concreta.`,
          angle: 'education',
        },
        quest: {
          title: `Contra ${lx}`,
          concept: `Nombra ${lx} como la norma de la categoría y propone otro camino.`,
          hook: `Nadie dijo que tenía que ser así: ${lx}.`,
          angle: 'opinion',
        },
      };
      return {
        ...byVoice[voice],
        role: 'education',
        objective: `Explicar cómo ${brand.name} responde a ${lx}`,
        rationale: `Nace de un problema que el ADN reconoce en su audiencia.`,
        trait: 'una tensión real de su audiencia',
      };
    }
    case 'value': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'hook' | 'angle'>> = {
        craft: {
          title: `Una historia de ${lx}`,
          hook: `Te contamos por qué ${lx} importa aquí.`,
          angle: 'storytelling',
        },
        method: {
          title: `${capitalize(lx)} en la práctica`,
          hook: `Así se ve ${lx} en un día de trabajo.`,
          angle: 'case',
        },
        quest: {
          title: `La ruta de ${lx}`,
          hook: `${capitalize(lx)} no se declara: se recorre.`,
          angle: 'opinion',
        },
      };
      return {
        ...byVoice[voice],
        concept: `Lleva el valor «${x}» a una situación concreta del trabajo de ${brand.name}.`,
        role: 'community',
        objective: `Hacer tangible el valor «${lx}» para la comunidad`,
        rationale: `${capitalize(x)} es un valor de la marca: el plan lo convierte en conversación.`,
        trait: `su valor «${lx}»`,
      };
    }
    case 'element': {
      const byVoice: Record<Voice, Pick<Template, 'title' | 'hook' | 'angle'>> = {
        craft: {
          title: `El detalle: ${lx}`,
          hook: `Mira ${lx} despacio.`,
          angle: 'behind_the_scenes',
        },
        method: {
          title: `Visto de cerca: ${lx}`,
          hook: `Acércate a ${lx}: ahí está el detalle que importa.`,
          angle: 'education',
        },
        quest: {
          title: `Siguiendo ${lx}`,
          hook: `Sigue ${lx} hasta el final.`,
          angle: 'storytelling',
        },
      };
      return {
        ...byVoice[voice],
        concept: `Centra la pieza en ${lx}, un elemento propio de la identidad visual.`,
        role: 'engagement',
        objective: `Hacer reconocible ${lx} como parte de la marca`,
        rationale: `Refuerza un elemento recurrente del lenguaje visual de la marca.`,
        trait: `un elemento propio de su lenguaje visual (${lx})`,
      };
    }
  }
}

function sourcesOf(payload: Payload): Source[] {
  const { brand, campaign } = payload;
  const sources: Source[] = [];
  for (const deliverable of payload.deliverables) {
    if (deliverable.inProduction) continue;
    if (!['content', 'video', 'photo'].includes(deliverable.type)) continue;
    sources.push({
      kind: 'deliverable',
      label: deliverable.title,
      deliverableRef: deliverable.ref,
      format: deliverable.format,
    });
  }
  // Proyectos de la campaña: trabajo real que la estrategia ya puso en marcha.
  const campaignProjects = payload.projects.filter((project) => project.inCampaign);
  campaignProjects
    .slice(0, 2)
    .forEach((project) =>
      sources.push({ kind: 'project', label: project.name, projectRef: project.ref }),
    );
  if (campaign) {
    const pillars = campaign.strategy.contentPillars;
    pillars.forEach((pillar) =>
      sources.push({
        kind: 'pillar',
        label: pillar.name,
        detail: pillar.purpose,
        pillar: pillar.name,
      }),
    );
    campaign.strategy.supportingMessages.slice(0, 3).forEach((message, index) =>
      sources.push({
        kind: 'message',
        label: message,
        pillar: pillars[index % Math.max(pillars.length, 1)]?.name,
      }),
    );
  }
  payload.projects
    .filter((project) => !project.inCampaign)
    .slice(0, 3)
    .forEach((project) =>
      sources.push({ kind: 'project', label: project.name, projectRef: project.ref }),
    );
  if (!campaign) {
    brand.differentiators
      .slice(0, 2)
      .forEach((label) => sources.push({ kind: 'differentiator', label }));
    const [problem] = brand.audience.problems;
    if (problem) sources.push({ kind: 'tension', label: problem });
    brand.values.slice(0, 2).forEach((label) => sources.push({ kind: 'value', label }));
    brand.visual.recurringElements
      .slice(0, 1)
      .forEach((label) => sources.push({ kind: 'element', label }));
  }
  return sources;
}

const PILLAR_PURPOSE: Record<Voice, (value: string, brand: string) => string> = {
  craft: (value, brand) => `Contar ${value} desde las personas que lo hacen posible en ${brand}.`,
  method: (value, brand) => `Demostrar ${value} con el proceso visible de ${brand}.`,
  quest: (value, brand) => `Recorrer ${value} como un camino que ${brand} invita a descubrir.`,
};

function pillarsOf(payload: Payload, voice: Voice): { name: string; purpose: string }[] {
  const strategyPillars = payload.campaign?.strategy.contentPillars ?? [];
  if (strategyPillars.length) return strategyPillars.slice(0, 5);
  const { brand } = payload;
  const pillars = [
    ...brand.values.slice(0, 3).map((value) => ({
      name: fit(capitalize(value), 80),
      purpose: fit(PILLAR_PURPOSE[voice](lower(value), brand.name), 400),
    })),
    ...brand.differentiators.slice(0, 1).map((statement) => ({
      name: fit(capitalize(statement), 80),
      purpose: fit(`Hacer visible lo que distingue a la marca: ${lower(statement)}.`, 400),
    })),
  ];
  return pillars.filter(
    (pillar, index) => pillars.findIndex((other) => same(other.name, pillar.name)) === index,
  );
}

function formatFor(
  source: Source,
  platform: ContentPlatform,
  used: Map<string, number>,
  required: readonly ContentFormat[] = [],
  avoided: readonly ContentFormat[] = [],
  memoryPreferred: readonly ContentFormat[] = [],
): ContentFormat {
  const fitting = FORMATS[platform].filter(
    (format) => !required.length || required.includes(format),
  );
  const allowed = fitting.length ? fitting : required.length ? [...required] : FORMATS[platform];
  // Prompt 16: sin los formatos que la memoria evita y con los que prefiere primero.
  const kept = allowed.filter((format) => !avoided.includes(format));
  const base = kept.length ? kept : allowed;
  const options = [
    ...base.filter((format) => memoryPreferred.includes(format)),
    ...base.filter((format) => !memoryPreferred.includes(format)),
  ];
  const wanted = source.format?.toLocaleLowerCase('es') ?? '';
  const fromSource = options.find(
    (format) =>
      (format === 'reel' && /reel/.test(wanted)) ||
      (format === 'carousel' && /carrusel|carousel/.test(wanted)) ||
      (format === 'story' && /stor|historia/.test(wanted)),
  );
  if (fromSource) return fromSource;
  const index = used.get(platform) ?? 0;
  used.set(platform, index + 1);
  return options[index % options.length]!;
}

export function composeDemoEnterpriseContentPlan(payload: Payload): GeneratedEnterpriseContentPlan {
  const { brand, campaign, request } = payload;
  const voice = VOICE_OF[brand.archetype.id] ?? 'method';
  const pillars = pillarsOf(payload, voice);
  const sources = sourcesOf(payload);
  const history = [
    ...payload.recentContent.flatMap((item) => [item.title, item.hook ?? '']),
    ...payload.previousProposals.map((proposal) => proposal.title),
  ].filter(Boolean);
  const messages = campaign
    ? [campaign.strategy.keyMessage, ...campaign.strategy.supportingMessages]
    : brand.differentiators.map((statement) => `${capitalize(statement)}.`);
  const materials = brand.visual.materials;
  const like = brand.likes[0];
  const used = new Map<string, number>();
  const items: Item[] = [];
  const step = Math.max(1, request.days.length / request.itemCount);

  const rounds = 1 + FRAMES[voice].length;
  for (let round = 0; items.length < request.itemCount && round < rounds; round++) {
    for (const source of sources) {
      if (items.length >= request.itemCount) break;
      const index = items.length;
      const platform = request.allowedPlatforms[index % request.allowedPlatforms.length]!;
      const base = templateFor(voice, source, payload);
      const framed = round > 0 ? FRAMES[voice][round - 1]!(source.label.replace(/\.$/, '')) : null;
      const t = framed ? { ...base, ...framed } : base;
      const title = fit(t.title, 160);
      if (
        [...history, ...items.map((other) => other.title)].some((other) => tooSimilar(other, title))
      )
        continue;
      if (history.some((other) => tooSimilar(other, t.hook))) continue;
      const format = formatFor(
        source,
        platform,
        used,
        request.requiredFormats,
        request.avoidedFormats,
        request.memoryPreferredFormats,
      );
      const material = materials.length ? materials[index % materials.length] : null;
      const message = messages.length ? messages[index % messages.length]! : null;
      items.push({
        title,
        concept: fit(t.concept, 1000),
        rationale: fit(t.rationale, 600),
        brandRationale: fit(
          `Se apoya en ${t.trait}${material ? ` y usa ${material}` : ''}${like ? ` (${lower(like)})` : ''}, con tono ${brand.communication.tone.slice(0, 2).join(' y ')}: ${VOICE_REASON[voice]}.`,
          600,
        ),
        objective: fit(t.objective, 300),
        strategicRole: t.role,
        funnelStage:
          t.role === 'launch' || t.role === 'awareness'
            ? 'awareness'
            : t.role === 'community' || t.role === 'engagement'
              ? 'retention'
              : 'consideration',
        audience: [fit(brand.audience.summary, 160)],
        platform,
        format,
        pillar: fit(source.pillar ?? pillars[index % pillars.length]!.name, 80),
        angle: t.angle,
        strategicMessage: message ? fit(message, 300) : null,
        hook: fit(t.hook, 300),
        suggestedAngle: null,
        deliverableRef: source.deliverableRef ?? null,
        projectRef: source.projectRef ?? null,
        suggestedDate: request.days[Math.min(request.days.length - 1, Math.floor(index * step))]!,
      });
    }
  }

  const platforms = request.allowedPlatforms.map((p) => CONTENT_PLATFORM_LABELS[p]).join(' y ');
  const pillarNames = pillars.map((pillar) => lower(pillar.name)).join(', ');
  const approach: Record<Voice, string> = {
    craft: 'contar desde las personas, el oficio y el detalle',
    method: 'demostrar con proceso, pruebas y explicaciones claras',
    quest: 'proponer retos y recorridos con un hallazgo al final',
  };
  return {
    strategySummary: fit(
      campaign
        ? `El plan desarrolla la campaña «${campaign.name}» en ${platforms}: cada pieza baja a contenido una parte de «${lower(campaign.strategy.concept)}». El enfoque editorial es ${approach[voice]}.`
        : `Plan editorial de ${brand.name} sin campaña, en ${platforms}: se apoya en ${pillarNames}. El enfoque editorial es ${approach[voice]}, con un tono ${brand.communication.tone.slice(0, 2).join(' y ')}.`,
      1200,
    ),
    editorialObjective: fit(
      request.goal ??
        (campaign
          ? campaign.objective
          : `Hacer visible lo que distingue a ${brand.name}: ${lower(brand.differentiators[0] ?? brand.values[0] ?? brand.industry)}`),
      400,
    ),
    campaignAlignment: campaign
      ? fit(
          `Cada pieza parte de un pilar de la estrategia (${pillarNames}) y de sus mensajes, empezando por «${campaign.strategy.keyMessage}». Las piezas de campaña pendientes se desarrollan aquí; las que ya están en producción no se repiten.`,
          800,
        )
      : null,
    distributionRationale: fit(
      `Abre con «${items[0]?.title ?? ''}» y alterna pilares para que ninguna idea se repita seguida${payload.projects.length ? '; los proyectos reales aportan el proceso' : ''}.`,
      600,
    ),
    pillars: pillars.map((pillar) => ({ name: pillar.name, purpose: fit(pillar.purpose, 400) })),
    items,
  };
}
