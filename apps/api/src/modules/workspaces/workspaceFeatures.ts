import {
  workspaceSupportsFeature,
  WorkspaceTypeSchema,
  type WorkspaceFeature,
} from '@pixel/contracts';
import { badRequest } from '../../lib/errors.js';
import type { WorkspaceDocument } from './workspace.model.js';

/*
 * Feature gating de la API: un único punto que consulta las capacidades derivadas del tipo de
 * workspace (packages/contracts/capabilities.ts). Los servicios llaman a assertWorkspaceFeature en
 * lugar de repetir comprobaciones de `workspace.type`.
 */

/**
 * Funcionalidad no disponible en este tipo de workspace → 400 `feature_not_available` (con
 * `expected` = el tipo que sí la tiene, si es uno solo).
 */
export function assertWorkspaceFeature(
  workspace: WorkspaceDocument,
  feature: WorkspaceFeature,
  message: string,
): void {
  if (workspaceSupportsFeature(workspace.type, feature)) return;
  const supported = WorkspaceTypeSchema.options.filter((type) =>
    workspaceSupportsFeature(type, feature),
  );
  throw badRequest(message, {
    reason: 'feature_not_available',
    feature,
    ...(supported.length === 1 ? { expected: supported[0] } : {}),
  });
}

/** Variante silenciosa para lecturas internas (p. ej. el contexto del chat). */
export function hasWorkspaceFeature(
  workspace: WorkspaceDocument,
  feature: WorkspaceFeature,
): boolean {
  return workspaceSupportsFeature(workspace.type, feature);
}
