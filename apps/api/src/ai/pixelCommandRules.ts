import {
  PixelCommandEntitiesSchema,
  type CampaignType,
  type ContentFormat,
  type ContentPlatform,
  type GeneratedPixelInterpretation,
  type PixelCommandEntities,
  type PixelCommandIntent,
  type PixelExternalService,
  type PixelTimeframe,
} from '@pixel/contracts';
import type { PixelCommandPayload } from './pixelCommandPayload.js';

/*
 * Intérprete de PixelCommand por reglas (español). Lo usa el proveedor DEMO y es el respaldo cuando
 * un proveedor real falla. Solo entiende lenguaje: no conoce el workspace ni el ADN, y todo lo que
 * extrae es texto que el usuario escribió (recortado del original, con sus mayúsculas).
 *
 * `fold` quita tildes y pasa a minúsculas SIN cambiar la longitud: los índices de una coincidencia
 * en el texto plegado valen para el original.
 */

export function fold(text: string): string {
  return Array.from(text)
    .map((char) => {
      if (char.length !== 1) return char;
      const base = (char.normalize('NFD')[0] ?? char).toLowerCase();
      return base.length === 1 ? base : char;
    })
    .join('');
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  doce: 12,
  quince: 15,
  veinte: 20,
};

const PLATFORM_TERMS: [ContentPlatform, string][] = [
  ['instagram', 'instagram|insta|ig'],
  ['tiktok', 'tik ?tok'],
  ['youtube', 'youtube'],
  ['facebook', 'facebook|fb'],
  ['linkedin', 'linked ?in'],
  ['x', 'twitter'],
  ['blog', 'blog'],
  ['newsletter', 'newsletter|boletin'],
];

const FORMAT_TERMS: [ContentFormat, string][] = [
  ['reel', 'reels?'],
  ['carousel', 'carrusel(?:es)?|carousels?'],
  ['story', 'stor(?:y|ies)|historias'],
  ['photo', 'fotos?|fotografias?'],
  ['short_video', 'videos? cortos?|shorts'],
  ['long_video', 'videos? largos?'],
  ['article', 'articulos?'],
];

const NEGATION =
  '(?:sin|no quiero|no incluyas|no uses|no|quita|quitar|quitale|quitemos|elimina|eliminar|menos|excepto|salvo|nada de)';

/** Términos mencionados, separando los negados ("sin Stories", "quita TikTok"). */
function mentions<T extends string>(t: string, terms: [T, string][]) {
  const wanted: T[] = [];
  const excluded: T[] = [];
  for (const [value, pattern] of terms) {
    const negated = new RegExp(`\\b${NEGATION}\\b(?:\\s+\\w+){0,3}?\\s+(?:${pattern})\\b`).test(t);
    if (negated) excluded.push(value);
    else if (new RegExp(`\\b(?:${pattern})\\b`).test(t)) wanted.push(value);
  }
  return { wanted, excluded };
}

function timeframeOf(t: string): PixelTimeframe | null {
  if (/\b(?:proximas|siguientes) (?:dos|2) semanas\b|\bquincena\b|\b(?:15|quince) dias\b/.test(t)) {
    return 'next_two_weeks';
  }
  if (/\b(?:proxima|siguiente) semana\b|\bsemana que viene\b/.test(t)) return 'next_week';
  if (/\besta semana\b/.test(t)) return 'this_week';
  if (/\b(?:proximo|siguiente) mes\b|\bmes que viene\b/.test(t)) return 'next_month';
  if (/\beste mes\b/.test(t)) return 'this_month';
  if (/\bhoy\b/.test(t)) return 'today';
  return null;
}

function pieceCountOf(t: string): number | null {
  const match =
    /\b(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte)\s+(?:reels?|posts?|publicaciones|publicacion|piezas?|contenidos?|historias|stories|carruseles|carrusel|videos?|fotos?|articulos?)\b/.exec(
      t,
    );
  if (!match) return null;
  const raw = match[1]!;
  const value = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? null);
  return value && value >= 1 && value <= 30 ? value : null;
}

/** Fin de una frase nominal: periodo, plataforma, conectores o puntuación. */
const PHRASE_END =
  '(?=\\s+(?:la proxima|la siguiente|la semana|esta semana|este mes|el proximo|el mes|hoy|manana|antes de|a partir de|(?:en|por) (?:redes|instagram|insta|tiktok|youtube|facebook|linkedin|twitter|el blog)|y (?:quiero|necesito|moverl[oa]s?|publicar)|para (?:que|esta|la proxima))\\b|\\s*[,.;:!?¿¡]|\\s*$)';

/** Recorta del ORIGINAL el grupo 1 de una coincidencia en el texto plegado. */
function capture(original: string, t: string, pattern: RegExp): string | null {
  const match = new RegExp(pattern.source, 'd').exec(t);
  const range = match?.indices?.[1];
  if (!range) return null;
  const value = original.slice(range[0], range[1]).trim();
  return value || null;
}

const GENERIC_SUBJECT =
  /^(?:(?:el|la|los|las|un|una|nuestro|nuestra|mi|mis)\s+)?(?:nuevos?|nuevas?)?\s*(?:producto|productos|servicio|servicios|algo|esto|eso|lanzamiento|marca|la marca|cosa|novedad)?$/;

const isGeneric = (value: string) => GENERIC_SUBJECT.test(fold(value).trim());

const LAUNCH_VERB =
  '(?:lanzar|lanzamos|lanza|lanzaremos|promocionar|promociona|promover|dar a conocer|mover|moverlo|moverla|impulsar|presentar)';

function productOf(original: string, t: string): string | null {
  const value = capture(
    original,
    t,
    new RegExp(
      `\\b${LAUNCH_VERB}\\s+(?:(?:el|la|los|las|nuestro|nuestra|nuestros|nuestras|mi|mis)\\s+)?(.+?)${PHRASE_END}`,
    ),
  );
  if (!value || isGeneric(value)) return null;
  return value.slice(0, 200);
}

function topicOf(original: string, t: string): string | null {
  return (
    capture(original, t, new RegExp(`\\b(?:sobre|acerca de)\\s+(.+?)${PHRASE_END}`))?.slice(
      0,
      200,
    ) ?? null
  );
}

function campaignHintOf(original: string, t: string): string | null {
  const named = capture(
    original,
    t,
    new RegExp(`\\bcampanas?\\s+(?:de|del|de la|para|sobre|llamada)\\s+(.+?)${PHRASE_END}`),
  );
  if (named) return named.slice(0, 120);
  const launch = capture(
    original,
    t,
    new RegExp(`\\b(lanzamiento(?:\\s+(?:de|del|de la)\\s+.+?)?)${PHRASE_END}`),
  );
  return launch ? launch.slice(0, 120) : null;
}

function projectHintOf(original: string, t: string): string | null {
  const value = capture(
    original,
    t,
    new RegExp(
      `\\bproyectos?\\s+(?:de|del|de la|para|sobre|llamado)\\s+(.+?)(?=\\s+(?:con|y|para)\\s|\\s*[:,.;!?]|\\s*$)`,
    ),
  );
  return value ? value.slice(0, 120) : null;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const looksLikeTask = (value: string) => /^[a-zñ]+(?:ar|er|ir)\b/.test(fold(value));

function taskTitlesOf(original: string, t: string): string[] {
  const colon = original.indexOf(':');
  const list =
    colon >= 0
      ? original.slice(colon + 1)
      : capture(original, t, /\b(?:tareas?|pendientes?)\s+(?:para|de)\s+(.+?)\s*[.!?]?\s*$/);
  if (!list) return [];
  return list
    .split(/\s*(?:,|;|\n|\s+y\s+|\s+e\s+)\s*/)
    .map((item) => item.replace(/[.!?]+$/, '').trim())
    .filter((item) => item.length >= 3 && looksLikeTask(item))
    .map((item) => capitalize(item).slice(0, 200))
    .slice(0, 20);
}

function campaignTypeOf(t: string): CampaignType | null {
  if (
    /\bamor y amistad\b|\bsan valentin\b|\bnavidad\b|\bdia de (?:la madre|el padre|los ninos)\b|\bblack friday\b|\bhalloween\b|\btemporada\b|\baniversario\b/.test(
      t,
    )
  ) {
    return 'seasonal';
  }
  if (/\blanza|\blanzamiento\b|\bpresentar\b/.test(t)) return 'launch';
  if (/\beduca|\bexplicar\b|\bensenar\b/.test(t)) return 'education';
  if (/\bevento\b|\bferia\b|\bactivacion\b/.test(t)) return 'event';
  return null;
}

/** "Necesito lanzar X…" → "Lanzar X…": el objetivo en palabras del usuario. */
function objectiveOf(original: string): string {
  const cleaned = original
    .trim()
    .replace(
      /^(?:necesito|necesitamos|quiero|queremos|me gustaria|nos gustaria|hay que|vamos a|tenemos que|ayudame a|ayúdame a|haz|hagamos|crea|prepara|armemos)\s+/i,
      '',
    )
    .replace(/^(?:un|una)\s+/i, '')
    .replace(/[.!?¿¡]+$/, '')
    .trim();
  return capitalize(cleaned || original.trim()).slice(0, 500);
}

const STATUS =
  /\bcuant[oa]s? (?:tareas|proyectos|campanas|piezas|contenidos|pendientes)\b|\bcomo (?:vamos|va|van|voy|estamos|esta|estan)\b|\ben que (?:va|vamos|estamos)\b|\bestado de\b|\bque (?:tengo|hay|me queda|queda) pendiente|\bque (?:tengo|hay) (?:hoy|para hoy|esta semana)\b|\bque falta\b|\bresumen del? (?:trabajo|dia|semana)\b/;
const ADVICE =
  /\bque te parece\b|\bque opinas\b|\bcomo (?:lo )?mejorar(?:ia|ias|as)?\b|\bmejorarias\b|\b(?:que|sobre que) (?:deberia|debo|podria|puedo) (?:publicar|hacer|escribir|subir|contar)\b|\bdame (?:\w+ )?ideas?\b|\bideas? (?:de|para)\b|\b(?:me )?recomiendas\b|\bconsejos?\b|\bfeedback\b|\bes buena idea\b/;
const TASKS =
  /\b(?:crea|crear|agrega|agregar|anade|anadir|apunta|apuntar|anota|anotar|pon|haz)(?:me)?\b(?:\s+\w+){0,3}?\s+(?:tareas?|pendientes)\b|\btareas? (?:para|de)\b|\brecuerdame\b/;
const SINGLE_CONTENT =
  /\b(?:crea|crear|agrega|agregar|anade|anadir|guarda|guardar|apunta|apuntar)\s+(?:un|una)\s+(?:post|reel|carrusel|historia|story|video|articulo|publicacion|pieza|foto)\b/;
const CAMPAIGN_WORD = /\bcampanas?\b/;
const USING_CAMPAIGN =
  /\b(?:usando|con|de|para|segun|en|sobre|desde) (?:la|esta|nuestra|mi|una) campanas?\b/;
const LAUNCH = new RegExp(`\\b${LAUNCH_VERB}\\b`);
const CONTENT =
  /\b(?:contenidos?|publicar|publicaciones?|posts?|reels?|stories|historias|carrusel(?:es)?|plan de contenido|calendario|parrilla|piezas?)\b/;
const PROJECT =
  /\b(?:organiza|organizar|ordena|ordenar|estructura|estructurar|planifica|planificar|arma|armar|crea|crear|monta|montar)\b(?:\s+\w+){0,3}?\s+proyectos?\b/;
/** «Crea un proyecto … y agrega tres tareas»: crear el proyecto manda sobre las tareas (Prompt 18). */
const NEW_PROJECT =
  /\b(?:crea|creame|crear|arma|armame|monta|montame|abre|abreme)\s+(?:un|una|el|mi)?\s*(?:nuevo\s+)?proyecto\b/;
/** Preguntas de definición («¿Qué es una campaña?»): se responden, nunca crean nada. */
const DEFINITION =
  /^\W*(?:pixel[,:]?\s+)?(?:que (?:es|son|significa|significan|quiere decir)|para que (?:sirve|sirven)|como funciona|cual es la diferencia|que diferencia hay|explicame (?:que|como))\b/;

/*
 * Acciones en servicios externos (Prompt 18). Se reconocen ANTES que cualquier otra intención para
 * que «Pon una reunión en mi Google Calendar» nunca acabe en un plan de contenido: Pixel la entiende
 * y responde con honestidad lo que puede y no puede hacer. «Calendario de contenido» sigue siendo
 * planear contenido: el calendario externo exige nombrarlo o hablar de un evento en tu calendario.
 */
const PAYMENT =
  /^\W*(?:pixel[,:]?\s+)?(?:por favor\s+)?(?:compra(?:me|r)?|paga(?:me|le|r)?|transfiere(?:le)?|transferir|consigna(?:le)?|haz (?:el |un |una )?(?:pago|transferencia|compra))\b|\b(?:paga|pagar|pagale) (?:esto|eso|la factura|el recibo|la cuenta)\b|\btransfi(?:ere|ere?le|eran) \d/;
const GOOGLE_CALENDAR = /\bgoogle calendar\b|\bcalendario de google\b|\bgcal\b/;
const CALENDAR_EVENT =
  /\b(?:reunion|reuniones|cita|citas|evento|eventos|llamada|llamadas|meeting)\b[\s\S]{0,80}\b(?:mi|el|tu|al|en) (?:calendario|agenda)\b|\b(?:mi|el|tu) (?:calendario|agenda)\b[\s\S]{0,40}\b(?:reunion|cita|evento|llamada)\b|\boutlook\b|\bagenda(?:r|me|le)? (?:una |un )?(?:reunion|cita|llamada)\b/;
const EMAIL =
  /\b(?:envia|enviale|envie|enviar|manda|mandale|mandar|reenvia|reenviale|responde|respondele)\b(?:\s+\S+){0,6}?\s+(?:correo|correos|email|emails|e-mail|mail|mails)\b|\b(?:correo|email|mail) (?:a|para) [a-z]/;
const MESSAGING =
  /\b(?:envia|enviale|manda|mandale|escribele)\b[\s\S]{0,40}\b(?:whatsapp|slack|telegram|sms|mensaje de texto)\b/;

/** ¿Pide crear un proyecto NUEVO («Crea un proyecto…»)? Entonces no se reutiliza uno parecido. */
export function asksNewProject(request: string): boolean {
  return NEW_PROJECT.test(fold(request));
}

/** El servicio externo que pide la frase, si pide uno (null = ninguno). */
export function externalServiceOf(t: string): PixelExternalService | null {
  if (PAYMENT.test(t)) return 'payment';
  if (GOOGLE_CALENDAR.test(t)) return 'google_calendar';
  if (CALENDAR_EVENT.test(t)) return 'calendar';
  if (MESSAGING.test(t)) return 'messaging';
  if (EMAIL.test(t)) return 'email';
  return null;
}

const ORDINALS: Record<string, number> = {
  primera: 1,
  primero: 1,
  segunda: 2,
  segundo: 2,
  tercera: 3,
  tercero: 3,
  cuarta: 4,
  cuarto: 4,
  quinta: 5,
  quinto: 5,
  sexta: 6,
  septima: 7,
  octava: 8,
  novena: 9,
  decima: 10,
};

/**
 * Un ajuste que quita tareas de la propuesta: «Quita la segunda», «Elimina la tarea 3», «Quita
 * practicar derivadas», «Sin la última». Devuelve las que quedan (o las mismas si no quita nada).
 */
export function removeTaskTitles(message: string, titles: string[]): string[] {
  const t = fold(message);
  if (!/\b(?:quita|quitale|quitar|elimina|eliminar|borra|borrar|saca|sacar|sin)\b/.test(t))
    return titles;
  const positions = new Set<number>();
  for (const [word, position] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) positions.add(position);
  }
  for (const match of t.matchAll(/\b(?:tarea|la|numero|n\.?)\s*(\d{1,2})\b/g)) {
    positions.add(Number(match[1]));
  }
  if (/\bultima\b/.test(t) && titles.length) positions.add(titles.length);
  const byName = titles.filter((title) => t.includes(fold(title)));
  return titles.filter((title, index) => !positions.has(index + 1) && !byName.includes(title));
}

/*
 * Creative Memory (Prompt 16). Solo expresiones inequívocamente PERSISTENTES crean una propuesta de
 * memoria; "hoy no quiero Stories" o "esta vez quiero Stories" afectan solo a la solicitud actual.
 */
const MEMORY_SHOW =
  /\bque (?:has aprendido|sabes|recuerdas)\b|\blo que (?:has aprendido|recuerdas)\b|\bque tienes en cuenta\b|\bmuestrame (?:tu|la) memoria\b/;
const MEMORY_FORGET =
  /\bolvida(?:te)?\b|\bolvidalo\b|\bdeja de (?:recordar|tener en cuenta)\b|\bya no (?:recuerdes|tengas en cuenta)\b/;
const MEMORY_REMEMBER =
  /\brecuerda(?:lo)?\b(?! ?me\b)|\bten en cuenta que\b|\bde ahora en adelante\b|\bdesde ahora\b|\ba partir de ahora\b|\bno vuelvas a\b|\bno volvamos a\b|\bpara esta marca\b|\bhabitualmente\b/;
/** "Solo en la campaña X podemos usar neón": una excepción con alcance. */
const MEMORY_EXCEPTION =
  /\bsolo (?:en|para) (?:esta|la|una|nuestra)? ?campanas?\b.{0,80}\b(?:podemos|se puede|se permite|se permiten|permit\w*|vale)\b|\b(?:podemos|se puede) usar\b.{0,60}\bsolo (?:en|para) (?:esta|la|una)? ?campanas?\b/;
/** Débiles: solo si la frase no pide otra cosa ("prefiero carruseles educativos"). */
const MEMORY_WEAK = /\b(?:siempre|nunca|prefiero|preferimos|normalmente prefiero)\b/;

function memoryActionOf(
  t: string,
  other: PixelCommandIntent,
): 'remember' | 'forget' | 'show' | null {
  if (MEMORY_SHOW.test(t)) return 'show';
  if (MEMORY_FORGET.test(t)) return 'forget';
  if (MEMORY_REMEMBER.test(t) || MEMORY_EXCEPTION.test(t)) return 'remember';
  if (other === 'unknown' && MEMORY_WEAK.test(t)) return 'remember';
  return null;
}

function memoryScopeHintOf(t: string): 'workspace' | 'campaign' | null {
  if (/\b(?:esta|la|una|nuestra) campanas?\b|\bsolo (?:en|para)\b.{0,40}\bcampanas?\b/.test(t)) {
    return 'campaign';
  }
  if (
    /\bpara (?:esta marca|la marca|todo|todas)\b|\ben general\b|\bde ahora en adelante\b|\bsiempre\b|\bnunca\b|\bnormalmente\b|\bhabitualmente\b|\bdesde ahora\b|\ba partir de ahora\b|\bno vuelvas a\b|\bno volvamos a\b/.test(
      t,
    )
  ) {
    return 'workspace';
  }
  return null;
}

/** "Olvida lo de evitar Stories" → "evitar Stories"; "Recuerda que prefiero X" → la frase entera. */
function memoryTextOf(original: string, action: 'remember' | 'forget' | 'show'): string | null {
  if (action === 'show') return null;
  if (action === 'forget') {
    const t = fold(original);
    const match =
      /\b(?:olvida(?:te)?|olvidalo|deja de (?:recordar|tener en cuenta)|ya no (?:recuerdes|tengas en cuenta))\b\s*(?:(?:de|lo de|lo que|que|eso de|la preferencia de)\s+)*/.exec(
        t,
      );
    const rest = match ? original.slice(match.index + match[0].length) : original;
    return (
      rest
        .replace(/[.!?¿¡]+$/, '')
        .trim()
        .slice(0, 500) || original.trim().slice(0, 500)
    );
  }
  return original
    .trim()
    .replace(/^pixel[,:]?\s+/i, '')
    .slice(0, 500);
}

function intentOf(t: string): PixelCommandIntent {
  if (externalServiceOf(t)) return 'external_action';
  if (STATUS.test(t)) return 'work_status';
  if (DEFINITION.test(t)) return 'creative_advice';
  if (ADVICE.test(t)) return 'creative_advice';
  if (NEW_PROJECT.test(t)) return 'organize_project';
  if (TASKS.test(t)) return 'create_tasks';
  if (SINGLE_CONTENT.test(t)) return 'create_content';
  if (CAMPAIGN_WORD.test(t) && !USING_CAMPAIGN.test(t)) return 'create_campaign';
  if (LAUNCH.test(t)) return 'create_campaign';
  if (PROJECT.test(t)) return 'organize_project';
  if (CONTENT.test(t)) return 'plan_content';
  return 'unknown';
}

/** Interpreta UNA solicitud (sin mezclar con la anterior: eso lo hace el backend). */
export function interpretPixelRequest(
  request: string,
  availableIntents: readonly PixelCommandIntent[],
): GeneratedPixelInterpretation {
  const t = fold(request);
  let intent = intentOf(t);
  // Una acción externa nunca se confunde con memoria ni con contenido.
  if (intent === 'external_action' && availableIntents.includes('external_action')) {
    return {
      intent,
      confidence: 0.85,
      entities: PixelCommandEntitiesSchema.parse({ externalService: externalServiceOf(t) }),
      missingRequiredInformation: [],
    };
  }
  const memoryAction = availableIntents.includes('manage_memory')
    ? memoryActionOf(t, intent)
    : null;
  if (memoryAction) {
    return {
      intent: 'manage_memory',
      confidence: 0.8,
      entities: PixelCommandEntitiesSchema.parse({
        memoryAction,
        memoryText: memoryTextOf(request, memoryAction),
        memoryScopeHint: memoryAction === 'remember' ? memoryScopeHintOf(t) : null,
        campaignHint: campaignHintOf(request, t),
      }),
      missingRequiredInformation: [],
    };
  }
  // Sin campañas en este tipo de Pixel: lo más cercano es planear contenido.
  if (intent === 'create_campaign' && !availableIntents.includes('create_campaign')) {
    intent = 'plan_content';
  }
  if (!availableIntents.includes(intent)) intent = 'unknown';

  const platforms = mentions(t, PLATFORM_TERMS);
  const formats = mentions(t, FORMAT_TERMS);
  const explicitCampaign = CAMPAIGN_WORD.test(t) && !USING_CAMPAIGN.test(t);
  // Una campaña con tema ("de Amor y Amistad", "para el aniversario"), no solo la palabra.
  const campaignTheme =
    explicitCampaign && /\bcampanas?\s+(?:de|del|de la|para|sobre)\s+\S/.test(t);
  const product = productOf(request, t);
  const mappedFromCampaign = intentOf(t) === 'create_campaign' && intent === 'plan_content';
  const entities: PixelCommandEntities = PixelCommandEntitiesSchema.parse({
    productOrService: intent === 'create_campaign' ? product : null,
    objective:
      intent === 'create_campaign' && (campaignTheme || product) ? objectiveOf(request) : null,
    campaignType: intent === 'create_campaign' ? campaignTypeOf(t) : null,
    timeframe: timeframeOf(t),
    platforms: platforms.wanted,
    excludedPlatforms: platforms.excluded,
    formats: formats.wanted,
    excludedFormats: formats.excluded,
    pieceCount: pieceCountOf(t),
    campaignHint: intent === 'create_campaign' ? null : campaignHintOf(request, t),
    projectHint: projectHintOf(request, t),
    topic: topicOf(request, t) ?? (mappedFromCampaign ? product : null),
    taskTitles:
      intent === 'create_tasks' || intent === 'organize_project' ? taskTitlesOf(request, t) : [],
    includeContent:
      intent === 'create_campaign' &&
      (platforms.wanted.length > 0 || formats.wanted.length > 0 || CONTENT.test(t)),
  });
  const missing: string[] = [];
  if (intent === 'create_campaign' && !entities.productOrService && !entities.objective) {
    missing.push(explicitCampaign ? 'objective' : 'productOrService');
  }
  return {
    intent,
    confidence: intent === 'unknown' ? 0.3 : 0.75,
    entities,
    missingRequiredInformation: missing,
  };
}

/** Para el proveedor demo: el payload completo del intérprete. */
export function interpretPixelPayload(payload: PixelCommandPayload): GeneratedPixelInterpretation {
  return interpretPixelRequest(payload.userRequest, payload.availableIntents);
}
