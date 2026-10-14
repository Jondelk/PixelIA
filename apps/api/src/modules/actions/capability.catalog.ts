import {
  GeneratedActionPlanSchema,
  type GeneratedActionDraft,
  type PixelResourceKind,
} from '@pixel/contracts';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { ActionAuthorization, ActionEffect } from './action.types.js';
import type { ActionDraft } from './action.snapshot.js';
import type { PixelToolRegistry } from './toolRegistry.js';

/*
 * Catálogo compacto para la IA (Prompt 18, docs/PIXEL-TOOLS.md §Catálogo). La IA nunca ve claves
 * de herramientas ni ids de Mongo: recibe CAPABILITY_n con una descripción y, como recursos,
 * referencias PROJECT_n / TASK_n. Solo las capacidades RELEVANTES y DISPONIBLES en este workspace
 * (tipo, capacidad de contracts, conexión, efecto pedido). El backend resuelve cada referencia; lo
 * desconocido se rechaza y no se ejecuta.
 *
 * V1: los pasos de PixelCommand los sigue construyendo el planificador determinista (no hay una
 * llamada extra a la IA por solicitud). Este catálogo y `resolveActionDrafts` son el contrato para
 * cuando una solicitud necesite traducirse con IA (p. ej. eventos de calendario en el Prompt 19).
 */

export interface CatalogEntry {
  ref: string;
  toolKey: string;
  capabilityKey: string;
  description: string;
  effect: ActionEffect;
  kind: PixelResourceKind;
  authorization: ActionAuthorization;
  refFields: Record<string, PixelResourceKind>;
}

export function buildCapabilityCatalog(
  registry: PixelToolRegistry,
  workspace: WorkspaceDocument,
  options: { effects?: ActionEffect[] } = {},
): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const tool of registry.listAvailable(workspace)) {
    for (const capability of tool.capabilities) {
      if (options.effects && !options.effects.includes(capability.effect)) continue;
      const resolved = registry.resolve(tool.key, capability.key, workspace);
      if (!resolved) continue;
      entries.push({
        ref: `CAPABILITY_${entries.length + 1}`,
        toolKey: tool.key,
        capabilityKey: capability.key,
        description: capability.description,
        effect: capability.effect,
        kind: capability.resourceKind,
        authorization: resolved.authorization,
        refFields: capability.refFields ?? {},
      });
    }
  }
  return entries;
}

/** Lo único que ve la IA del catálogo: referencia, descripción y si pide confirmación. */
export function catalogForAI(entries: CatalogEntry[]) {
  return entries.map(({ ref, description, authorization }) => ({
    ref,
    description,
    requiresConfirmation: authorization !== 'none',
  }));
}

export interface DraftResolution {
  actions: ActionDraft[];
  /** Motivos de rechazo (si hay alguno, no se propone nada). */
  rejected: string[];
}

/**
 * Traduce los borradores de la IA a acciones del backend. Rechaza (y no propone NADA) si cita una
 * capacidad que no está en el catálogo, una dependencia que no es anterior, un recurso que no está
 * en el contexto o una entrada que no valida con su schema. Nunca inventa un dato que falte.
 */
export function resolveActionDrafts(
  raw: unknown,
  catalog: CatalogEntry[],
  registry: PixelToolRegistry,
  workspace: WorkspaceDocument,
  /** PROJECT_1 → id real, solo de este workspace (lo resolvió el contexto). */
  resources: Map<string, { kind: PixelResourceKind; id: string }>,
): DraftResolution {
  const parsed = GeneratedActionPlanSchema.safeParse(raw);
  if (!parsed.success)
    return { actions: [], rejected: ['La salida del planificador no es válida'] };
  if (parsed.data.responseMode === 'answer') return { actions: [], rejected: [] };

  const rejected: string[] = [];
  const actions: ActionDraft[] = [];
  parsed.data.actions.forEach((draft: GeneratedActionDraft, index) => {
    const entry = catalog.find((candidate) => candidate.ref === draft.capabilityRef);
    if (!entry) {
      rejected.push(`Capacidad desconocida: ${draft.capabilityRef.slice(0, 40)}`);
      return;
    }
    if (entry.effect === 'read') {
      rejected.push('Una lectura no es una acción a confirmar');
      return;
    }
    const id = `ai_${index + 1}`;
    const input: Record<string, unknown> = {};
    const inputRefs: ActionDraft['inputRefs'] = [];
    let dependsOnActionId: string | null = null;
    for (const [field, value] of Object.entries(draft.input)) {
      const kind = entry.refFields[field];
      if (kind && typeof value === 'string' && /^[A-Z]+_\d+$/.test(value)) {
        const resource = resources.get(value);
        if (!resource || resource.kind !== kind) {
          rejected.push(`Recurso fuera de contexto: ${value}`);
          return;
        }
        input[field] = resource.id;
      } else {
        input[field] = value;
      }
    }
    if (draft.dependsOn !== null) {
      if (draft.dependsOn > index) {
        rejected.push('Una acción solo puede depender de una anterior');
        return;
      }
      const source = actions[draft.dependsOn - 1];
      const field = Object.entries(entry.refFields).find(([, kind]) => kind === source?.kind)?.[0];
      if (!source || !field) {
        rejected.push('Dependencia no válida');
        return;
      }
      dependsOnActionId = source.id;
      inputRefs.push({ field, fromAction: source.id, kind: source.kind });
    }
    const capability = registry.resolve(entry.toolKey, entry.capabilityKey, workspace)?.capability;
    if (!capability || !capability.inputSchema.safeParse(input).success) {
      rejected.push(`Datos incompletos o no válidos para «${draft.title}»`);
      return;
    }
    actions.push({
      id,
      stepId: 'ai',
      toolKey: entry.toolKey,
      capabilityKey: entry.capabilityKey,
      kind: entry.kind,
      effect: entry.effect,
      title: draft.title,
      label: draft.title,
      input,
      inputRefs,
      dependsOnActionId,
    });
  });
  return rejected.length ? { actions: [], rejected } : { actions, rejected };
}
