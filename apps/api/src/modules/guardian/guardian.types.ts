import type {
  BrandDna,
  CampaignStrategy,
  ContentFormat,
  ContentPlatform,
  GuardianDimension,
  GuardianMode,
  GuardianResourceType,
  GuardianSeverity,
} from '@pixel/contracts';
import type { Vocabulary } from '../content-plans/contentPlanning.grounding.js';
import type { ResolvedMemory } from '../creative-memory/memory.resolver.js';
import type { ReferenceIndex } from './guardian.references.js';

/*
 * Tipos internos del Brand Guardian (docs/BRAND-GUARDIAN.md). El motor nunca recibe documentos
 * Mongo: recibe una INSTANTÁNEA controlada del recurso (sus textos con referencias RESOURCE_TEXT_n,
 * su dirección visual estructurada y sus piezas) más el ADN y, si aplica, la estrategia de campaña.
 */

/** Un texto evaluable del recurso. `field`/`targetId` permiten aplicar una corrección después. */
export interface GuardianText {
  ref: string;
  /** "Título", "Mensaje principal", "Pieza 3 · Hook"… */
  label: string;
  text: string;
  role:
    'title' | 'copy' | 'concept' | 'message' | 'cta' | 'objective' | 'hook' | 'visual' | 'other';
  field: string | null;
  targetId: string | null;
}

/** Una pieza de contenido (plan o ContentItem): para el encaje plataforma–formato y la campaña. */
export interface GuardianPiece {
  label: string;
  platform: ContentPlatform | null;
  format: ContentFormat | null;
  pillar: string | null;
  /** Referencias de sus textos (RESOURCE_TEXT_n). */
  textRefs: string[];
}

export interface GuardianVisualDirection {
  mood: string[];
  colors: string[];
  materials: string[];
  composition: string[];
  photography: string[];
  motion: string[];
  avoid: string[];
}

export interface GuardianResourceSnapshot {
  label: string;
  texts: GuardianText[];
  visualDirection: GuardianVisualDirection | null;
  pieces: GuardianPiece[];
  /** Fecha del recurso al revisarlo (detección de "desactualizado"). */
  updatedAt: Date | null;
}

export interface GuardianEvaluationInput {
  workspaceId: string;
  mode: GuardianMode;
  resourceType: GuardianResourceType;
  resourceId: string | null;
  brandName: string;
  brandDna: BrandDna;
  campaign: { id: string; name: string } | null;
  campaignStrategy: CampaignStrategy | null;
  resource: GuardianResourceSnapshot;
  /**
   * Prompt 16: memorias creativas activas y relevantes (MEMORY_n). Evidencia creativa, NUNCA
   * factual: no fundamentan cifras, precios, promociones ni claims.
   */
  memories?: ResolvedMemory[];
  /** Textos que el usuario aportó (su solicitud en el preflight, datos confirmados en una revisión). */
  userSupplied: string[];
}

/** Lo que el motor prepara una vez para todos los evaluadores. */
export interface GuardianContext {
  input: GuardianEvaluationInput;
  refs: ReferenceIndex;
  /** Lo que fundamenta cifras, nombres y promociones: ADN + campaña + lo aportado por el usuario. */
  vocabulary: Vocabulary;
}

/** Pista para "Corregir con Pixel": qué quitar o suavizar en qué texto (interna, no sale de la API). */
export interface GuardianFixHint {
  ref: string;
  kind:
    | 'remove_phrase'
    | 'remove_claim'
    | 'normalize_shouting'
    | 'soften_urgency'
    | 'remove_proper_name';
  match: string;
}

export interface GuardianFindingDraft {
  evaluator: string;
  dimension: GuardianDimension;
  severity: GuardianSeverity;
  blocking: boolean;
  code: string;
  title: string;
  message: string;
  evidence: string[];
  /** Referencias controladas del ADN o la campaña (se traducen a texto legible). */
  brandRefs: string[];
  /** Evidencia de marca en texto cuando no hay una referencia ("sin registro en el ADN"). */
  brandEvidence?: string[];
  recommendation: string | null;
  canAutoFix: boolean;
  canOverride: boolean;
  fix: GuardianFixHint[];
  source: 'deterministic' | 'ai';
}

export interface GuardianEvaluatorResult {
  dimension: GuardianDimension;
  findings: GuardianFindingDraft[];
  summary: string | null;
}

/**
 * Un evaluador. `supports` decide si aplica al recurso (si no, su dimensión no penaliza);
 * `evaluate` hace la parte determinista; `semantic` declara si además pide criterio a la IA (el
 * motor agrupa todas esas peticiones en UNA llamada estructurada).
 */
export interface GuardianEvaluator {
  id: string;
  dimension: GuardianDimension;
  semantic: boolean;
  supports(input: GuardianEvaluationInput): boolean;
  evaluate(context: GuardianContext): GuardianEvaluatorResult;
}
