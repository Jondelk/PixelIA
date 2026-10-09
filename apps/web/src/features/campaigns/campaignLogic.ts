import {
  CreateCampaignSchema,
  GenerateCampaignSchema,
  type AcceptCampaignDeliverableResponse,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
  type CreateCampaignInput,
  type GenerateCampaignInput,
} from '@pixel/contracts';
import { errorReason } from '../../lib/api';
import { zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { dateInputToIso, formatLongDate } from '../operations/dates';

/* ---------- Filtros de la lista ---------- */

export const CAMPAIGN_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'draft', label: 'Borrador' },
  { id: 'planned', label: 'Planificadas' },
  { id: 'active', label: 'Activas' },
  { id: 'completed', label: 'Completadas' },
  { id: 'archived', label: 'Archivadas' },
] as const;
export type CampaignFilter = (typeof CAMPAIGN_FILTERS)[number]['id'];

export function isCampaignFilter(value: string | null): value is CampaignFilter {
  return CAMPAIGN_FILTERS.some((filter) => filter.id === value);
}

/** Estados que pide cada filtro ("Todas" = sin estado: la API excluye las archivadas). */
export function campaignFilterStatuses(filter: CampaignFilter): CampaignStatus[] | undefined {
  return filter === 'all' ? undefined : [filter];
}

/* ---------- Formularios (todo texto, como los inputs) ---------- */

export interface CampaignFormState {
  name: string;
  objective: string;
  campaignType: CampaignType | '';
  productOrService: string;
  targetAudience: string[];
  problem: string;
  desiredOutcome: string;
  channels: string[];
  startDate: string;
  endDate: string;
  constraints: string[];
  mandatoryElements: string[];
}

export const emptyCampaignForm: CampaignFormState = {
  name: '',
  objective: '',
  campaignType: '',
  productOrService: '',
  targetAudience: [],
  problem: '',
  desiredOutcome: '',
  channels: [],
  startDate: '',
  endDate: '',
  constraints: [],
  mandatoryElements: [],
};

type FormResult<T> = { ok: true; input: T } | { ok: false; errors: FieldErrors };

function briefFields(form: CampaignFormState) {
  return {
    objective: form.objective,
    campaignType: form.campaignType || null,
    productOrService: form.productOrService,
    targetAudience: form.targetAudience,
    problem: form.problem,
    desiredOutcome: form.desiredOutcome,
    channels: form.channels,
    startDate: dateInputToIso(form.startDate),
    endDate: dateInputToIso(form.endDate),
    constraints: form.constraints,
    mandatoryElements: form.mandatoryElements,
  };
}

/** Campaña manual: nombre y objetivo obligatorios (misma validación que la API). */
export function manualCampaignInput(form: CampaignFormState): FormResult<CreateCampaignInput> {
  const input: CreateCampaignInput = { name: form.name, ...briefFields(form) };
  const result = CreateCampaignSchema.safeParse(input);
  return result.success ? { ok: true, input } : { ok: false, errors: zodFieldErrors(result.error) };
}

/** Con Pixel: basta el objetivo (el nombre se deriva si falta). */
export function pixelCampaignInput(form: CampaignFormState): FormResult<GenerateCampaignInput> {
  const input: GenerateCampaignInput = {
    ...(form.name.trim() ? { name: form.name } : {}),
    ...briefFields(form),
  };
  const result = GenerateCampaignSchema.safeParse(input);
  return result.success ? { ok: true, input } : { ok: false, errors: zodFieldErrors(result.error) };
}

/* ---------- Errores de generación ---------- */

export function campaignGenerationError(err: unknown): { title: string; reason: string | null } {
  const reason = errorReason(err);
  switch (reason) {
    case 'brand_dna_missing':
      return { title: 'Pixel aún no conoce el ADN de esta marca', reason };
    case 'enterprise_company_missing':
      return { title: 'Este Pixel aún no tiene empresa', reason };
    case 'campaign_generation_unavailable':
      return { title: 'La generación de campañas no está disponible ahora mismo', reason };
    case 'campaign_generation_failed':
      return { title: 'Pixel no pudo construir una estrategia fundamentada', reason };
    default:
      return { title: 'No se pudo crear la campaña', reason };
  }
}

/* ---------- Presentación ---------- */

/** "1 de noviembre de 2026 – 30 de noviembre de 2026" (lo que exista). */
export function campaignPeriod(campaign: Pick<Campaign, 'startDate' | 'endDate'>): string | null {
  const { startDate, endDate } = campaign;
  if (!startDate && !endDate) return null;
  if (startDate && endDate) return `${formatLongDate(startDate)} – ${formatLongDate(endDate)}`;
  return startDate
    ? `Desde el ${formatLongDate(startDate)}`
    : `Hasta el ${formatLongDate(endDate!)}`;
}

/** Aviso tras aceptar una pieza, con el enlace al recurso creado (o ya existente). */
export function conversionFeedback(
  result: AcceptCampaignDeliverableResponse,
  base: string,
): { message: string; href: string } | null {
  if (result.contentItem) {
    return {
      message: result.created ? 'Creado en Contenido' : 'Ya estaba en Contenido',
      href: `${base}/content`,
    };
  }
  if (result.project) {
    return {
      message: result.created ? 'Proyecto creado' : 'El proyecto ya existía',
      href: `${base}/projects/${result.project.id}`,
    };
  }
  return null;
}

/* ---------- Detalle ---------- */

export const CAMPAIGN_TABS = [
  { id: 'strategy', label: 'Estrategia' },
  { id: 'deliverables', label: 'Piezas' },
  { id: 'projects', label: 'Proyectos' },
  { id: 'content', label: 'Contenido' },
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number]['id'];

export function isCampaignTab(value: string | null): value is CampaignTab {
  return CAMPAIGN_TABS.some((tab) => tab.id === value);
}

/** Mientras Pixel construye o regenera la estrategia (PixelThinking). */
export const CAMPAIGN_THINKING_COPY = {
  title: 'Pixel está construyendo la estrategia de campaña…',
  description:
    'Está leyendo el ADN de la marca, el brief y el trabajo reciente para proponer un concepto, una dirección visual y las piezas que la campaña necesita. Puede tardar un poco.',
};
