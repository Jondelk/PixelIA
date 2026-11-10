import {
  brandProfileOf,
  brandSignalSources,
  brandSignals,
  familyClash,
  familyHits,
  signalsIn,
} from '../../../ai/index.js';
import { similarity } from '../../content-plans/contentPlanning.grounding.js';
import { refsWithPrefix } from '../guardian.references.js';
import type {
  GuardianContext,
  GuardianEvaluator,
  GuardianFindingDraft,
  GuardianText,
} from '../guardian.types.js';
import { quote } from './text.js';

/*
 * Evaluadores con criterio semántico. Cada uno tiene una parte determinista (lo verificable con
 * reglas) y declara si además pide la evaluación semántica (IA o demo), que el motor agrupa en una
 * sola llamada. Nada de aquí bloquea: son juicios creativos, el usuario decide.
 */

const CAMPAIGN_RESOURCES = ['campaign', 'campaign_strategy'] as const;
const CONTENT_RESOURCES = ['content_plan', 'content_plan_item', 'content_item'] as const;

const draft = (
  partial: Omit<
    GuardianFindingDraft,
    'blocking' | 'canOverride' | 'fix' | 'source' | 'canAutoFix'
  > &
    Partial<Pick<GuardianFindingDraft, 'canAutoFix'>>,
): GuardianFindingDraft => ({
  blocking: false,
  canOverride: true,
  canAutoFix: false,
  fix: [],
  source: 'deterministic',
  ...partial,
});

/* ---------- Identidad ---------- */

/** Toda la parte de identidad es semántica (IA o demo, que usa el léxico de estilos y el ADN). */
export const identityEvaluator: GuardianEvaluator = {
  id: 'identity',
  dimension: 'identity',
  semantic: true,
  supports: (input) => input.resource.texts.length > 0,
  evaluate: () => ({ dimension: 'identity', findings: [], summary: null }),
};

/* ---------- Estrategia ---------- */

function coreTexts(context: GuardianContext): GuardianText[] {
  return context.input.resource.texts.filter((text) =>
    ['concept', 'message', 'objective', 'title', 'copy'].includes(text.role),
  );
}

export const strategyEvaluator: GuardianEvaluator = {
  id: 'strategy',
  dimension: 'strategy',
  semantic: true,
  supports: (input) =>
    (CAMPAIGN_RESOURCES as readonly string[]).includes(input.resourceType) ||
    (input.resourceType === 'pixel_proposal' &&
      input.mode === 'preflight' &&
      input.resource.texts.some((t) => t.role === 'objective')),
  evaluate(context) {
    const { input, refs } = context;
    const texts = coreTexts(context);
    const joined = texts.map((text) => text.text).join(' ');
    const signals = brandSignals(
      brandSignalSources(input.brandDna),
      `${input.brandName} ${input.brandDna.identity.industry}`,
    );
    const found = signalsIn(joined, signals);
    const generic = familyHits(joined, 'generic');
    const findings: GuardianFindingDraft[] = [];
    const differentiators = refsWithPrefix(refs, 'BRAND_DIFFERENTIATOR').map((e) => e.ref);
    if (!found.length && (generic.length >= 1 || joined.split(/\s+/).length >= 12)) {
      findings.push(
        draft({
          evaluator: 'strategy',
          dimension: 'strategy',
          severity: generic.length ? 'medium' : 'low',
          code: 'generic_strategy',
          title: 'La idea podría ser de cualquier marca',
          message: generic.length
            ? `Se apoya en palabras genéricas (${generic.join(', ')}) y no usa ningún diferenciador, valor ni rasgo propio de ${input.brandName}.`
            : `No usa ningún diferenciador, valor ni rasgo propio de ${input.brandName}: así planteada, la podría firmar otra marca.`,
          evidence: texts.slice(0, 2).map((text) => quote(text)),
          brandRefs: differentiators.length
            ? differentiators
            : refsWithPrefix(refs, 'BRAND_ESSENCE').map((e) => e.ref),
          recommendation: `Ancla la idea en lo que solo ${input.brandName} puede decir: ${input.brandDna.differentiators.statements.slice(0, 2).join(' · ') || input.brandDna.identity.essence}.`,
        }),
      );
    }
    return {
      dimension: 'strategy',
      findings,
      summary: found.length
        ? `Se apoya en rasgos propios de la marca (${found.slice(0, 2).join(' · ')}).`
        : null,
    };
  },
};

/* ---------- Alineación con la campaña ---------- */

/** Texto de la estrategia sin el nombre de la marca ni la categoría (los comparte todo). */
function campaignCorpus(context: GuardianContext): string[] {
  return context.refs.campaign
    .filter((entry) => /^CAMPAIGN_(CONCEPT|BIGIDEA|MESSAGE|PILLAR|NARRATIVE)_/.test(entry.ref))
    .map((entry) => entry.text);
}

export function alignmentScore(
  text: string,
  corpus: string[],
  brandName: string,
  industry: string,
): number {
  const strip = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter(
        (word) =>
          !`${brandName} ${industry}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9ñ]+/)
            .includes(word),
      )
      .join(' ');
  const clean = strip(text);
  return Math.max(0, ...corpus.map((source) => similarity(clean, strip(source))));
}

export const ALIGNMENT_THRESHOLD = 0.06;

export const campaignAlignmentEvaluator: GuardianEvaluator = {
  id: 'campaign_alignment',
  dimension: 'campaign_alignment',
  semantic: true,
  supports: (input) =>
    input.campaignStrategy !== null &&
    ((CONTENT_RESOURCES as readonly string[]).includes(input.resourceType) ||
      input.resourceType === 'copy' ||
      input.resourceType === 'pixel_proposal'),
  evaluate(context) {
    const { input, refs } = context;
    const corpus = campaignCorpus(context);
    const findings: GuardianFindingDraft[] = [];
    const pieces = input.resource.pieces.length
      ? input.resource.pieces.map((piece) => ({
          label: piece.label,
          pillar: piece.pillar,
          texts: input.resource.texts.filter((text) => piece.textRefs.includes(text.ref)),
        }))
      : [{ label: input.resource.label, pillar: null, texts: input.resource.texts }];
    const pillars = (input.campaignStrategy?.contentPillars ?? []).map((p) => p.name.toLowerCase());
    const offPieces = pieces.filter((piece) => {
      if (piece.pillar && pillars.includes(piece.pillar.toLowerCase())) return false;
      const text = piece.texts.map((t) => t.text).join(' ');
      return (
        alignmentScore(text, corpus, input.brandName, input.brandDna.identity.industry) <
        ALIGNMENT_THRESHOLD
      );
    });
    if (offPieces.length) {
      const concept = input.campaignStrategy!.concept;
      findings.push(
        draft({
          evaluator: 'campaign_alignment',
          dimension: 'campaign_alignment',
          severity: offPieces.length === pieces.length ? 'medium' : 'low',
          code: 'off_campaign',
          title:
            offPieces.length === 1 && pieces.length === 1
              ? 'No desarrolla el concepto de la campaña'
              : `${offPieces.length} de ${pieces.length} piezas no desarrollan la campaña`,
          message: `${offPieces.length === 1 ? 'La pieza' : 'Estas piezas'} podría${offPieces.length === 1 ? '' : 'n'} funcionar por separado, pero no baja${offPieces.length === 1 ? '' : 'n'} a contenido «${concept}» ni sus mensajes y pilares.`,
          evidence: offPieces
            .slice(0, 4)
            .map((piece) => (piece.texts[0] ? quote(piece.texts[0]) : piece.label)),
          brandRefs: [
            ...refsWithPrefix(refs, 'CAMPAIGN_CONCEPT'),
            ...refsWithPrefix(refs, 'CAMPAIGN_MESSAGE').slice(0, 1),
          ].map((entry) => entry.ref),
          recommendation: `Conecta cada pieza con «${concept}» o con un pilar de la campaña (${pillars.join(', ') || 'sus mensajes'}).`,
        }),
      );
    }
    return {
      dimension: 'campaign_alignment',
      findings,
      summary: offPieces.length ? null : 'Desarrolla el concepto y los mensajes de la campaña.',
    };
  },
};

/* ---------- Contenido ---------- */

/** Formatos razonables por plataforma (convención de Pixel, no "lo que premia el algoritmo"). */
const PLATFORM_FORMATS: Record<string, string[]> = {
  instagram: ['reel', 'carousel', 'story', 'photo', 'post', 'short_video'],
  tiktok: ['short_video', 'reel'],
  youtube: ['long_video', 'short_video'],
  facebook: ['post', 'reel', 'photo', 'short_video', 'carousel', 'story'],
  linkedin: ['post', 'article', 'carousel', 'short_video', 'photo'],
  x: ['post', 'photo', 'short_video'],
  blog: ['article'],
  newsletter: ['newsletter', 'article'],
  other: [],
};

export const contentEvaluator: GuardianEvaluator = {
  id: 'content',
  dimension: 'content',
  semantic: true,
  supports: (input) => input.resource.pieces.length > 0,
  evaluate({ input }) {
    const findings: GuardianFindingDraft[] = [];
    for (const piece of input.resource.pieces) {
      if (!piece.platform || !piece.format || piece.platform === 'other') continue;
      const allowed = PLATFORM_FORMATS[piece.platform] ?? [];
      if (allowed.length && !allowed.includes(piece.format)) {
        findings.push(
          draft({
            evaluator: 'content',
            dimension: 'content',
            severity: 'low',
            code: 'format_platform_mismatch',
            title: `${piece.label}: el formato no es habitual en esa plataforma`,
            message: `Un ${piece.format.replace('_', ' ')} no es un formato propio de ${piece.platform}. No es un error de marca, pero obliga a adaptar la pieza.`,
            evidence: [piece.label],
            brandRefs: [],
            brandEvidence: [
              'Convención de formatos por plataforma de Pixel (no métricas de la red)',
            ],
            recommendation: `Usa un formato propio de ${piece.platform} (${allowed.slice(0, 3).join(', ')}).`,
          }),
        );
      }
    }
    return {
      dimension: 'content',
      findings,
      summary: findings.length ? null : 'Formatos y plataformas encajan.',
    };
  },
};

/* ---------- Dirección visual (estructurada, nunca imágenes) ---------- */

export const visualDirectionEvaluator: GuardianEvaluator = {
  id: 'structured_visual_direction',
  dimension: 'visual_direction',
  semantic: false,
  supports: (input) =>
    input.resource.visualDirection !== null ||
    input.resource.texts.some((text) => text.role === 'visual'),
  evaluate({ input, refs }) {
    const visual = input.resource.visualDirection;
    const parts: { label: string; text: string }[] = [
      ...(visual
        ? (
            ['mood', 'colors', 'materials', 'composition', 'photography', 'motion'] as const
          ).flatMap((key) =>
            visual[key].map((value) => ({ label: `Dirección visual → ${key}`, text: value })),
          )
        : []),
      ...input.resource.texts
        .filter((text) => text.role === 'visual')
        .map((text) => ({ label: text.label, text: text.text })),
    ];
    const joined = parts.map((part) => part.text).join(' ');
    const findings: GuardianFindingDraft[] = [];
    for (const family of ['cold_tech', 'luxury', 'childish', 'rustic'] as const) {
      const hits = familyHits(joined, family);
      const clash = hits.length ? familyClash(family, brandProfileOf(input.brandDna)) : null;
      if (!clash) continue;
      findings.push(
        draft({
          evaluator: 'structured_visual_direction',
          dimension: 'visual_direction',
          severity: hits.length >= 2 ? 'high' : 'medium',
          code: `visual_${family}_clash`,
          title: 'La dirección visual no se parece al lenguaje de la marca',
          message: `Propone ${hits.join(', ')}, y ${clash.reason}. Es una descripción escrita: no se ha analizado ninguna imagen.`,
          evidence: parts
            .filter((part) => familyHits(part.text, family).length)
            .slice(0, 3)
            .map((part) => `${part.label}: «${part.text}»`),
          brandRefs: clash.prefixes
            .flatMap((prefix) => refsWithPrefix(refs, prefix).slice(0, 2))
            .map((e) => e.ref),
          recommendation: `Lleva la dirección hacia ${[...input.brandDna.visualLanguage.materials, ...input.brandDna.creativePreferences.likes].slice(0, 3).join(', ') || 'el lenguaje visual del ADN'}.`,
        }),
      );
    }
    return {
      dimension: 'visual_direction',
      findings,
      summary: findings.length
        ? null
        : 'La dirección visual escrita es coherente con el lenguaje visual del ADN.',
    };
  },
};
