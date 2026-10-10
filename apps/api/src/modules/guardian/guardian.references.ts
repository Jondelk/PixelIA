import type { BrandDna, CampaignStrategy } from '@pixel/contracts';
import type { GuardianText } from './guardian.types.js';

/*
 * Referencias controladas del Guardian. Cada rasgo del ADN, cada parte de la estrategia y cada
 * texto evaluado recibe una referencia estable (BRAND_TONE_1, CAMPAIGN_MESSAGE_2, RESOURCE_TEXT_3)
 * con su etiqueta legible ("ADN → Comunicación → tono"). La IA solo puede citar estas referencias:
 * una que no exista se descarta, y un hallazgo que se queda sin fundamento también.
 */

export interface ReferenceEntry {
  ref: string;
  /** Ruta legible para la UI: "ADN → Comunicación → tono". */
  label: string;
  text: string;
}

export interface ReferenceIndex {
  brand: ReferenceEntry[];
  campaign: ReferenceEntry[];
  resource: ReferenceEntry[];
  byRef: Map<string, ReferenceEntry>;
}

function collector() {
  const entries: ReferenceEntry[] = [];
  const counters = new Map<string, number>();
  return {
    entries,
    add(prefix: string, label: string, text: string | null | undefined) {
      const value = text?.trim();
      if (!value) return;
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      entries.push({ ref: `${prefix}_${next}`, label, text: value });
    },
  };
}

const DIMENSION_LABELS: Record<keyof BrandDna['personality']['dimensions'], [string, string]> = {
  innovation: ['tradicional', 'innovadora'],
  sophistication: ['accesible', 'sofisticada'],
  warmth: ['distante', 'cercana'],
  playfulness: ['seria', 'lúdica'],
  energy: ['serena', 'enérgica'],
};

export function brandReferences(dna: BrandDna): ReferenceEntry[] {
  const c = collector();
  c.add('BRAND_ESSENCE', 'ADN → Identidad → esencia', dna.identity.essence);
  c.add('BRAND_ORIGIN', 'ADN → Identidad → origen', dna.identity.origin);
  c.add('BRAND_PURPOSE', 'ADN → Propósito', dna.purpose.purpose);
  dna.purpose.values.forEach((value) => c.add('BRAND_VALUE', 'ADN → Valores', value));
  c.add('BRAND_AUDIENCE', 'ADN → Audiencia', dna.audience.summary);
  dna.audience.needs.forEach((need) => c.add('BRAND_NEED', 'ADN → Audiencia → necesidad', need));
  dna.personality.traits.forEach((trait) =>
    c.add('BRAND_TRAIT', 'ADN → Personalidad', trait.label),
  );
  for (const [key, [low, high]] of Object.entries(DIMENSION_LABELS) as [
    keyof typeof DIMENSION_LABELS,
    [string, string],
  ][]) {
    const value = dna.personality.dimensions[key];
    c.add(
      'BRAND_DIMENSION',
      'ADN → Personalidad → ejes',
      `${value <= 50 ? low : high} (${value}/100, de ${low} a ${high})`,
    );
  }
  const archetype = dna.archetypes.primary;
  c.add('BRAND_ARCHETYPE', 'ADN → Arquetipo', archetype.id);
  dna.communication.tone.forEach((tone) => c.add('BRAND_TONE', 'ADN → Comunicación → tono', tone));
  c.add(
    'BRAND_FORMALITY',
    'ADN → Comunicación → formalidad',
    `${dna.communication.formality.label} (${dna.communication.formality.level}/5)`,
  );
  c.add(
    'BRAND_ENERGY',
    'ADN → Comunicación → energía',
    `${dna.communication.energy.label} (${dna.communication.energy.level}/5)`,
  );
  c.add('BRAND_LANGUAGE', 'ADN → Comunicación → idioma', dna.communication.language.name);
  dna.communication.vocabulary.preferred.forEach((word) =>
    c.add('BRAND_PREFERRED_WORD', 'ADN → Comunicación → palabras que usa', word),
  );
  dna.communication.vocabulary.avoid.forEach((word) =>
    c.add('BRAND_AVOID_WORD', 'ADN → Comunicación → palabras que evita', word),
  );
  dna.communication.guidelines.do.forEach((rule) =>
    c.add('BRAND_GUIDELINE', 'ADN → Comunicación → pauta', rule),
  );
  dna.communication.guidelines.dont.forEach((rule) =>
    c.add('BRAND_GUIDELINE', 'ADN → Comunicación → evitar', rule),
  );
  dna.differentiators.statements.forEach((statement) =>
    c.add('BRAND_DIFFERENTIATOR', 'ADN → Diferenciadores', statement),
  );
  dna.visualLanguage.materials.forEach((material) =>
    c.add('BRAND_MATERIAL', 'ADN → Lenguaje visual → materiales', material),
  );
  dna.visualLanguage.styles.forEach((style) =>
    c.add('BRAND_STYLE', 'ADN → Lenguaje visual → estilo', style),
  );
  dna.visualLanguage.palette.forEach((color) =>
    c.add('BRAND_COLOR', 'ADN → Lenguaje visual → paleta', color.name ?? color.hex),
  );
  c.add(
    'BRAND_TEMPERATURE',
    'ADN → Lenguaje visual → temperatura',
    { warm: 'cálida', cool: 'fría', neutral: 'neutra' }[dna.visualLanguage.temperature],
  );
  dna.creativePreferences.likes.forEach((like) =>
    c.add('BRAND_LIKE', 'ADN → Preferencias → le gusta', like),
  );
  dna.creativePreferences.dislikes.forEach((dislike) =>
    c.add('BRAND_DISLIKE', 'ADN → Preferencias → rechaza', dislike),
  );
  dna.restrictions.creative.forEach((rule) =>
    c.add('BRAND_RESTRICTION', 'ADN → Restricciones', rule),
  );
  dna.restrictions.visual.forEach((rule) =>
    c.add('BRAND_VISUAL_RESTRICTION', 'ADN → Restricciones visuales', rule),
  );
  return c.entries;
}

export function campaignReferences(strategy: CampaignStrategy | null): ReferenceEntry[] {
  if (!strategy) return [];
  const c = collector();
  c.add('CAMPAIGN_CONCEPT', 'Campaña → Concepto', strategy.concept);
  c.add('CAMPAIGN_BIGIDEA', 'Campaña → Big idea', strategy.bigIdea);
  c.add('CAMPAIGN_MESSAGE', 'Campaña → Mensaje principal', strategy.keyMessage);
  strategy.supportingMessages.forEach((message) =>
    c.add('CAMPAIGN_MESSAGE', 'Campaña → Mensaje secundario', message),
  );
  strategy.contentPillars.forEach((pillar) =>
    c.add('CAMPAIGN_PILLAR', 'Campaña → Pilar', `${pillar.name}: ${pillar.purpose}`),
  );
  strategy.channels.forEach((channel) => c.add('CAMPAIGN_CHANNEL', 'Campaña → Canal', channel));
  c.add('CAMPAIGN_NARRATIVE', 'Campaña → Narrativa', strategy.campaignNarrative);
  return c.entries;
}

export function buildReferenceIndex(
  dna: BrandDna,
  strategy: CampaignStrategy | null,
  texts: GuardianText[],
): ReferenceIndex {
  const brand = brandReferences(dna);
  const campaign = campaignReferences(strategy);
  const resource = texts.map((text) => ({ ref: text.ref, label: text.label, text: text.text }));
  const byRef = new Map([...brand, ...campaign, ...resource].map((entry) => [entry.ref, entry]));
  return { brand, campaign, resource, byRef };
}

/** Evidencia legible de una referencia ("ADN → Comunicación → tono: cálido"). */
export const describe = (entry: ReferenceEntry) => `${entry.label}: ${entry.text}`;

/** Referencias del índice cuyo prefijo coincide (BRAND_TONE → todas las de tono). */
export const refsWithPrefix = (index: ReferenceIndex, prefix: string) =>
  [...index.byRef.values()].filter((entry) => entry.ref.startsWith(`${prefix}_`));
