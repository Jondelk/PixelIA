import {
  BRAND_ARCHETYPES,
  CONTENT_PLAN_DEFAULT_FREQUENCY,
  CONTENT_PLAN_MAX_ITEMS,
  GeneratedEnterpriseContentPlanSchema,
  type BrandDnaContent,
  type CampaignDeliverable,
  type CampaignStrategy,
  type ContentAngle,
  type ContentFormat,
  type ContentFunnelStage,
  type ContentItem,
  type ContentPillar,
  type ContentPlatform,
  type ContentStrategicRole,
  type GeneratedEnterpriseContentPlan,
  type Project,
} from '@pixel/contracts';
import {
  AIProviderError,
  ENTERPRISE_PLANNING_SCHEMA_NAME,
  enterprisePlanningPrompt,
  type AIProvider,
  type EnterprisePlanningPayload,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import {
  daysOf,
  dayToInstant,
  formatFromText,
  isNearDuplicate,
  platformFromText,
  spreadDays,
  uniqueValues,
} from './contentPlanning.grounding.js';
import { ContentPlanningError, limitAngleRepetition } from './contentPlanning.engine.js';
import {
  conflictsWithBrand,
  developsCampaign,
  enterprisePlanningVocabulary,
  forbiddenStemsFor,
  groundedPlanningText,
  isGrounded,
} from './enterprisePlanning.grounding.js';

/*
 * EnterprisePlanningStrategy: la estrategia del Content Planner para un Pixel de EMPRESA. Comparte
 * con la Personal el modelo (ContentPlan + ContentPlanItem), la persistencia y la aceptación; lo
 * que cambia es el cerebro:
 *
 *   BrandDNA (+ campaña con su estrategia VIGENTE y sus piezas, si se elige)
 *   + proyectos reales + contenido reciente + petición
 *     → payload controlado con referencias (CAMPAIGN_1, DELIVERABLE_n, PROJECT_n, CONTENT_n)
 *     → AIProvider.generateStructuredOutput (GeneratedEnterpriseContentPlanSchema)
 *     → validación contra la realidad (aquí) → propuesta (el servicio la guarda)
 *
 * Validación: sin cifras, precios, descuentos, claims ni nombres inventados; solo plataformas
 * permitidas; referencias conocidas (una desconocida descarta la propuesta); con campaña, cada pieza
 * desarrolla su estrategia; sin campaña no se finge ninguna; no repite piezas de campaña ya en
 * producción ni el contenido reciente. Sin IA disponible → `unavailable` (sin plan falso).
 */

/** Límites del contexto que recibe el modelo (rendimiento, coste y foco). */
export const ENTERPRISE_PLANNING_LIMITS = {
  activeProjects: 10,
  recentContent: 30,
  deliverables: 12,
  previousProposals: 40,
} as const;

export interface EnterprisePlanningCampaign {
  id: string;
  name: string;
  objective: string;
  productOrService: string | null;
  channels: string[];
  strategy: CampaignStrategy;
  deliverables: CampaignDeliverable[];
}

export interface EnterprisePlanningInput {
  workspaceId: string;
  company: { name: string };
  brandDna: BrandDnaContent;
  /** null = plan editorial de la marca sin campaña. */
  campaign: EnterprisePlanningCampaign | null;
  activeProjects: Project[];
  recentContent: ContentItem[];
  previousProposals: { title: string; status: string }[];
  requestedPeriod: { startDate: string; endDate: string };
  desiredFrequency?: number;
  requestedPlatforms?: ContentPlatform[];
  /** Formatos permitidos (vacío o ausente = cualquiera). */
  requiredFormats?: ContentFormat[];
  requestedGoal?: string;
  tzOffset: number;
}

export interface ProposedEnterpriseItem {
  title: string;
  concept: string;
  rationale: string;
  brandRationale: string;
  objective: string;
  audience: string[];
  platform: ContentPlatform;
  format: ContentFormat;
  pillar: string | null;
  angle: ContentAngle;
  hook: string | null;
  suggestedAngle: string | null;
  strategicRole: ContentStrategicRole | null;
  funnelStage: ContentFunnelStage | null;
  strategicMessage: string | null;
  scheduledFor: Date;
  projectId: string | null;
  campaignDeliverableId: string | null;
}

export interface EnterprisePlanProposal {
  strategySummary: string;
  editorialObjective: string;
  campaignAlignment: string | null;
  distributionRationale: string | null;
  pillars: ContentPillar[];
  items: ProposedEnterpriseItem[];
  platforms: ContentPlatform[];
  targetAudience: string[];
  discardedItems: number;
  frequencyPerWeek: number;
  frequencySource: 'request' | 'default';
  meta: { provider: string; model: string; mode: 'ai' | 'demo' };
}

export interface EnterprisePlanningStrategy {
  plan(input: EnterprisePlanningInput): Promise<EnterprisePlanProposal>;
}

/* ---------- 1. Petición y contexto controlado ---------- */

export interface EnterprisePlanningRequest {
  days: string[];
  itemCount: number;
  frequencyPerWeek: number;
  frequencySource: 'request' | 'default';
  allowedPlatforms: ContentPlatform[];
  preferredFormats: ContentFormat[];
  /** Formatos obligatorios del pedido (vacío = cualquiera). */
  requiredFormats: ContentFormat[];
}

/**
 * Plataformas: las pedidas → los canales de la campaña → ninguna (error claro: el BrandDNA no
 * declara plataformas). Frecuencia: la pedida o un valor conservador (3/semana). Nunca más de 30.
 */
export function resolveEnterpriseRequest(
  input: EnterprisePlanningInput,
): EnterprisePlanningRequest {
  const fromCampaign = input.campaign
    ? uniqueValues(
        [...input.campaign.strategy.channels, ...input.campaign.channels]
          .map(platformFromText)
          .map((platform) => (platform === 'other' ? null : platform)),
      )
    : [];
  const allowedPlatforms = input.requestedPlatforms?.length
    ? uniqueValues(input.requestedPlatforms)
    : fromCampaign;
  if (allowedPlatforms.length === 0) {
    throw new ContentPlanningError(
      'platforms_missing',
      input.campaign
        ? 'Indica al menos una plataforma: los canales de la campaña no son redes de contenido'
        : 'Indica al menos una plataforma para el plan de la marca',
    );
  }
  const [frequencyPerWeek, frequencySource] = input.desiredFrequency
    ? [input.desiredFrequency, 'request' as const]
    : [CONTENT_PLAN_DEFAULT_FREQUENCY, 'default' as const];
  const days = daysOf(input.requestedPeriod.startDate, input.requestedPeriod.endDate);
  return {
    days,
    itemCount: Math.min(
      CONTENT_PLAN_MAX_ITEMS,
      Math.max(1, Math.round((frequencyPerWeek * days.length) / 7)),
    ),
    frequencyPerWeek,
    frequencySource,
    allowedPlatforms,
    preferredFormats: uniqueValues(
      (input.campaign?.deliverables ?? []).map((d) => (d.format ? formatFromText(d.format) : null)),
    ),
    requiredFormats: uniqueValues(input.requiredFormats ?? []),
  };
}

/** Referencias controladas ↔ ids reales (el modelo solo ve las referencias). */
export interface ReferenceMap {
  deliverables: Map<string, CampaignDeliverable>;
  projects: Map<string, Project>;
}

export function buildEnterprisePayload(
  input: EnterprisePlanningInput,
  request: EnterprisePlanningRequest,
): { payload: EnterprisePlanningPayload; refs: ReferenceMap } {
  const dna = input.brandDna;
  const c = dna.communication;
  const deliverables = (input.campaign?.deliverables ?? [])
    .filter((deliverable) => deliverable.status !== 'rejected')
    .slice(0, ENTERPRISE_PLANNING_LIMITS.deliverables);
  const projects = input.activeProjects.slice(0, ENTERPRISE_PLANNING_LIMITS.activeProjects);
  const refs: ReferenceMap = {
    deliverables: new Map(deliverables.map((d, i) => [`DELIVERABLE_${i + 1}`, d])),
    projects: new Map(projects.map((p, i) => [`PROJECT_${i + 1}`, p])),
  };
  const strategy = input.campaign?.strategy;
  const payload: EnterprisePlanningPayload = {
    brand: {
      name: input.company.name,
      industry: dna.identity.industry,
      description: dna.identity.description,
      origin: dna.identity.origin,
      essence: dna.identity.essence,
      purpose: dna.purpose.purpose,
      values: dna.purpose.values,
      audience: {
        summary: dna.audience.summary,
        needs: dna.audience.needs,
        problems: dna.audience.problems,
      },
      personality: dna.personality.traits.map((trait) => trait.label),
      archetype: {
        id: dna.archetypes.primary.id,
        name: BRAND_ARCHETYPES[dna.archetypes.primary.id].name,
      },
      communication: {
        tone: c.tone,
        formality: c.formality.level,
        energy: c.energy.level,
        language: c.language.name,
        preferredWords: c.vocabulary.preferred,
        avoidWords: c.vocabulary.avoid,
      },
      visual: {
        styles: dna.visualLanguage.styles,
        materials: dna.visualLanguage.materials,
        recurringElements: dna.visualLanguage.recurringElements,
        palette: dna.visualLanguage.palette.map((color) => ({
          name: color.name,
          role: color.role,
        })),
      },
      differentiators: dna.differentiators.statements,
      likes: dna.creativePreferences.likes,
      dislikes: dna.creativePreferences.dislikes,
      restrictions: dna.restrictions,
    },
    campaign:
      input.campaign && strategy
        ? {
            ref: 'CAMPAIGN_1',
            name: input.campaign.name,
            objective: input.campaign.objective,
            productOrService: input.campaign.productOrService,
            channels: input.campaign.channels,
            strategyVersion: strategy.version,
            strategy: {
              strategicProblem: strategy.strategicProblem,
              strategicOpportunity: strategy.strategicOpportunity,
              insight: strategy.insight,
              insightType: strategy.insightType,
              bigIdea: strategy.bigIdea,
              concept: strategy.concept,
              campaignNarrative: strategy.campaignNarrative,
              keyMessage: strategy.keyMessage,
              supportingMessages: strategy.supportingMessages,
              tone: strategy.tone,
              channels: strategy.channels,
              contentPillars: strategy.contentPillars,
              visualMood: strategy.visualDirection.mood,
              visualAvoid: strategy.visualDirection.avoid,
            },
          }
        : null,
    deliverables: [...refs.deliverables].map(([ref, d]) => ({
      ref,
      title: d.title,
      type: d.type,
      platform: d.platform,
      format: d.format,
      objective: d.objective,
      inProduction: d.status === 'converted',
    })),
    projects: [...refs.projects].map(([ref, p]) => ({
      ref,
      name: p.name,
      type: p.type,
      status: p.status,
      description: p.description,
      goals: p.goals,
      inCampaign: input.campaign !== null && p.campaignId === input.campaign.id,
    })),
    recentContent: input.recentContent
      .slice(0, ENTERPRISE_PLANNING_LIMITS.recentContent)
      .map((item, i) => ({
        ref: `CONTENT_${i + 1}`,
        title: item.title,
        hook: item.hook,
        platform: item.platform,
        format: item.format,
      })),
    previousProposals: input.previousProposals.slice(
      0,
      ENTERPRISE_PLANNING_LIMITS.previousProposals,
    ),
    request: {
      startDate: input.requestedPeriod.startDate,
      endDate: input.requestedPeriod.endDate,
      days: request.days,
      itemCount: request.itemCount,
      allowedPlatforms: request.allowedPlatforms,
      preferredFormats: request.preferredFormats,
      requiredFormats: request.requiredFormats,
      goal: input.requestedGoal?.trim() || null,
    },
  };
  return { payload, refs };
}

export const ENTERPRISE_PLANNING_SYSTEM = `Eres Pixel, director creativo y director de contenido de esta marca. Conviertes su estrategia
en un sistema editorial coherente para un periodo concreto, a partir EXCLUSIVAMENTE del contexto
real que recibes (JSON).

Jerarquía de fuentes (una fuente inferior nunca contradice a una superior):
1. brand (su BrandDNA). 2. campaign.strategy (la estrategia vigente, si hay campaña). 3. el brief de
la campaña. 4. deliverables (sus piezas). 5. projects (trabajo real). 6. recentContent. 7. request.

Criterio:
- Con campaña: el plan DESARROLLA su estrategia; no crea otra campaña ni la sustituye por contenido
  genérico. Usa campaign.strategy.contentPillars como pilares, su concept, keyMessage y
  supportingMessages. Cada pieza tiene una relación clara con la estrategia.
- Las piezas pendientes de deliverables (inProduction = false) se desarrollan aquí: pon su ref en
  deliverableRef. Las que ya están en producción no se repiten como pendientes (sí una adaptación o
  continuación justificada).
- Sin campaña (campaign = null): plan editorial de la marca desde su ADN. No menciones ni inventes
  ninguna campaña; campaignAlignment = null.
- Los proyectos reales pueden generar contenido de proceso: pon su ref en projectRef. Nunca
  inventes proyectos.
- No repitas títulos, hooks ni ideas de recentContent ni de previousProposals.
- Pilares propios de esta marca (2 a 5), nunca una lista genérica.
- platform: SOLO una de request.allowedPlatforms. format: el más adecuado de la plataforma (prioriza
  request.preferredFormats; si request.requiredFormats no está vacío, SOLO esos). Exactamente request.itemCount piezas; suggestedDate dentro de request.days.
- Cada pieza: objective concreto (nunca "generar engagement"), rationale (por qué está en el plan) y
  brandRationale (por qué esta ejecución pertenece a ESTA marca, citando rasgos del ADN).
- strategicMessage sale de keyMessage/supportingMessages o del ADN. strategicRole y funnelStage solo
  si aportan.
- distributionRationale: cómo se reparte la narrativa en el periodo (sin porcentajes).

Honestidad (obligatorio):
- No inventes precios, descuentos, promociones, métricas, seguidores, crecimiento, testimonios,
  clientes, premios, certificaciones, cuota de mercado, años de experiencia, atributos de producto,
  ubicaciones, fechas ni claims ("el mejor", "líder", "número uno", "el favorito de…"). No uses
  nombres propios ni cifras que no estén en el contexto.
- No afirmes lo que prefieren los consumidores: formúlalo como hipótesis o recomendación.
- Respeta brand.restrictions, lo que la marca rechaza y las palabras que evita.

Explicación en español; hooks y mensajes en el idioma de la marca (brand.communication.language).`;

/* ---------- 2. Validación contra la realidad ---------- */

export function groundEnterprisePlan(
  raw: GeneratedEnterpriseContentPlan,
  payload: EnterprisePlanningPayload,
  refs: ReferenceMap,
  request: EnterprisePlanningRequest,
  tzOffset: number,
): Omit<
  EnterprisePlanProposal,
  'platforms' | 'targetAudience' | 'frequencyPerWeek' | 'frequencySource' | 'meta'
> {
  const vocabulary = enterprisePlanningVocabulary(payload);
  const forbidden = forbiddenStemsFor(payload);
  const clean = (text: string | null | undefined) => isGrounded(text, vocabulary);

  const strategySummary = groundedPlanningText(raw.strategySummary, vocabulary);
  if (!strategySummary) {
    throw new ContentPlanningError(
      'failed',
      'La estrategia editorial no se apoya en el contexto real',
    );
  }
  const editorialObjective =
    groundedPlanningText(raw.editorialObjective, vocabulary) ||
    payload.request.goal ||
    payload.campaign?.objective ||
    '';
  if (!editorialObjective) {
    throw new ContentPlanningError(
      'failed',
      'El objetivo editorial no se apoya en el contexto real',
    );
  }
  // Sin campaña no hay alineación con campaña (no se finge ninguna).
  const campaignAlignment = payload.campaign
    ? groundedPlanningText(raw.campaignAlignment, vocabulary) || null
    : null;
  const distributionRationale = groundedPlanningText(raw.distributionRationale, vocabulary) || null;

  const pillars: ContentPillar[] = [];
  for (const pillar of raw.pillars) {
    const name = pillar.name.trim();
    if (!name || !clean(name) || !clean(pillar.purpose)) continue;
    if (pillars.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) continue;
    pillars.push({ name, rationale: pillar.purpose.trim() });
  }

  // Lo que no debe repetirse: contenido reciente, propuestas anteriores y las piezas de campaña ya
  // en producción (como pendientes).
  const history = [
    ...payload.recentContent.flatMap((item) => [item.title, item.hook ?? '']),
    ...payload.previousProposals.map((proposal) => proposal.title),
  ].filter(Boolean);
  const inProduction = new Set(
    payload.deliverables.filter((d) => d.inProduction).map((d) => d.ref),
  );

  let discarded = 0;
  const kept: (Omit<ProposedEnterpriseItem, 'scheduledFor'> & { day: string | null })[] = [];
  const seen = [...history];
  for (const item of raw.items) {
    const deliverableRef = item.deliverableRef?.trim() || null;
    const projectRef = item.projectRef?.trim() || null;
    const deliverable = deliverableRef ? refs.deliverables.get(deliverableRef) : undefined;
    const project = projectRef ? refs.projects.get(projectRef) : undefined;
    const unknownRef = (deliverableRef && !deliverable) || (projectRef && !project);
    const texts = [
      item.title,
      item.concept,
      item.rationale,
      item.brandRationale,
      item.objective,
      item.strategicMessage,
      item.hook,
      item.suggestedAngle,
      item.pillar,
      ...item.audience,
    ];
    // Una pieza de campaña ya producida no vuelve como pendiente idéntica.
    const copiesProduced =
      deliverableRef !== null &&
      inProduction.has(deliverableRef) &&
      deliverable !== undefined &&
      isNearDuplicate(item.title, [deliverable.title]);
    const duplicate =
      isNearDuplicate(item.title, seen) ||
      (item.hook ? isNearDuplicate(item.hook, history) : false);
    const offStrategy =
      payload.campaign !== null && !developsCampaign(item, payload.campaign, Boolean(deliverable));
    if (
      unknownRef ||
      !request.allowedPlatforms.includes(item.platform) ||
      (request.requiredFormats.length > 0 && !request.requiredFormats.includes(item.format)) ||
      !texts.every(clean) ||
      conflictsWithBrand(`${item.title} ${item.concept} ${item.brandRationale}`, forbidden) ||
      copiesProduced ||
      duplicate ||
      offStrategy
    ) {
      discarded += 1;
      continue;
    }
    seen.push(item.title);
    const pillar = pillars.find(
      (existing) => existing.name.toLowerCase() === item.pillar.trim().toLowerCase(),
    );
    kept.push({
      title: item.title.trim(),
      concept: item.concept.trim(),
      rationale: item.rationale.trim(),
      brandRationale: item.brandRationale.trim(),
      objective: item.objective.trim(),
      audience: item.audience.map((entry) => entry.trim()).filter(Boolean),
      platform: item.platform,
      format: item.format,
      pillar: pillar?.name ?? null,
      angle: item.angle,
      hook: item.hook?.trim() || null,
      suggestedAngle: item.suggestedAngle?.trim() || null,
      strategicRole: item.strategicRole ?? null,
      funnelStage: item.funnelStage ?? null,
      strategicMessage: item.strategicMessage?.trim() || null,
      projectId: project?.id ?? null,
      campaignDeliverableId: deliverable?.id ?? null,
      day:
        item.suggestedDate && request.days.includes(item.suggestedDate) ? item.suggestedDate : null,
    });
  }

  const selected = limitAngleRepetition(kept, request.itemCount).slice(0, request.itemCount);
  discarded += kept.length - selected.length;
  if (selected.length === 0) {
    throw new ContentPlanningError('failed', 'Ninguna propuesta superó la validación');
  }
  const fallbackDays = spreadDays(request.days, selected.length);
  const items = selected
    .map(({ day, ...item }, index) => {
      const chosen = day ?? fallbackDays[index]!;
      return { ...item, scheduledFor: dayToInstant(chosen, tzOffset), day: chosen };
    })
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    .map(({ day: _day, ...item }) => item);

  return {
    strategySummary,
    editorialObjective,
    campaignAlignment,
    distributionRationale,
    pillars,
    items,
    discardedItems: discarded,
  };
}

/* ---------- Estrategia ---------- */

export function createEnterprisePlanningStrategy(deps: {
  ai: AIProvider;
  logger: Logger;
}): EnterprisePlanningStrategy {
  return {
    async plan(input) {
      const request = resolveEnterpriseRequest(input);
      const { payload, refs } = buildEnterprisePayload(input, request);
      let result: Awaited<ReturnType<AIProvider['generateStructuredOutput']>> & {
        data: GeneratedEnterpriseContentPlan;
      };
      try {
        result = await deps.ai.generateStructuredOutput({
          system: ENTERPRISE_PLANNING_SYSTEM,
          prompt: enterprisePlanningPrompt(payload),
          schema: GeneratedEnterpriseContentPlanSchema,
          schemaName: ENTERPRISE_PLANNING_SCHEMA_NAME,
          maxOutputTokens: 12_000,
          effort: 'medium',
        });
      } catch (err) {
        deps.logger.warn('Content Planner (enterprise): el proveedor de IA no generó el plan', {
          err,
        });
        if (
          err instanceof AIProviderError &&
          (err.kind === 'invalid_output' || err.kind === 'refused')
        ) {
          throw new ContentPlanningError('failed', 'Pixel no pudo construir un plan válido', err);
        }
        throw new ContentPlanningError(
          'unavailable',
          'La generación de planes no está disponible',
          err,
        );
      }
      // Doble validación: el proveedor ya valida con el schema; el motor vuelve a hacerlo.
      const parsed = GeneratedEnterpriseContentPlanSchema.safeParse(result.data);
      if (!parsed.success) {
        throw new ContentPlanningError('failed', 'El plan generado no cumple el esquema');
      }
      const grounded = groundEnterprisePlan(parsed.data, payload, refs, request, input.tzOffset);
      deps.logger.info('Content Planner: plan generado', {
        workspaceId: input.workspaceId,
        workspaceType: 'enterprise',
        generationType: input.campaign ? 'campaign' : 'brand',
        provider: result.provider,
        model: result.model,
        context: {
          projects: payload.projects.length,
          recentContent: payload.recentContent.length,
          deliverables: payload.deliverables.length,
        },
        discarded: grounded.discardedItems,
      });
      return {
        ...grounded,
        platforms: uniqueValues(grounded.items.map((item) => item.platform)),
        targetAudience: [input.brandDna.audience.summary].filter(Boolean),
        frequencyPerWeek: request.frequencyPerWeek,
        frequencySource: request.frequencySource,
        meta: { provider: result.provider, model: result.model, mode: result.mode },
      };
    },
  };
}
