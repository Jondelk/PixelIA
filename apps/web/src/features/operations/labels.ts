import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PIPELINE,
  CONTENT_PLATFORM_LABELS,
  CONTENT_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  TASK_STATUS_LABELS,
  type ContentStatus,
  type Project,
  type ProjectType,
} from '@pixel/contracts';
import type { SelectOption } from '../../components/SelectField';

/** Opciones de un <select> a partir de un mapa de etiquetas de contracts. */
export function labelOptions<T extends string>(
  labels: Record<T, string>,
  only?: readonly T[],
): SelectOption<T>[] {
  const values = only ?? (Object.keys(labels) as T[]);
  return values.map((value) => ({ value, label: labels[value] }));
}

export const priorityOptions = labelOptions(PRIORITY_LABELS);
export const projectStatusOptions = labelOptions(PROJECT_STATUS_LABELS);

/**
 * Opciones de tipo de proyecto de un workspace. Si el proyecto ya tiene un tipo fuera de la lista
 * (p. ej. datos anteriores), se conserva como opción para no cambiarlo sin querer al editar.
 */
export function projectTypeOptionsFor(
  allowed: readonly ProjectType[],
  current?: ProjectType,
): SelectOption<ProjectType>[] {
  const values = current && !allowed.includes(current) ? [...allowed, current] : allowed;
  return labelOptions(PROJECT_TYPE_LABELS, values);
}
export const taskStatusOptions = labelOptions(TASK_STATUS_LABELS);
export const contentStatusOptions = labelOptions(CONTENT_STATUS_LABELS);
export const platformOptions = labelOptions(CONTENT_PLATFORM_LABELS);
export const formatOptions = labelOptions(CONTENT_FORMAT_LABELS);

export function projectOptions(projects: readonly Project[]): SelectOption<string>[] {
  return projects.map((project) => ({ value: project.id, label: project.name }));
}

/** Etiquetas de las columnas del pipeline (en plural donde suena natural). */
export const PIPELINE_TAB_LABELS: Record<ContentStatus, string> = {
  ...CONTENT_STATUS_LABELS,
  idea: 'Ideas',
};

/** Siguiente etapa del pipeline (null en publicado o archivado). */
export function nextContentStatus(status: ContentStatus): ContentStatus | null {
  const index = (CONTENT_PIPELINE as readonly ContentStatus[]).indexOf(status);
  return index >= 0 && index < CONTENT_PIPELINE.length - 1 ? CONTENT_PIPELINE[index + 1]! : null;
}

/** "Instagram · Reel" (lo que exista). */
export function platformFormatLabel(item: {
  platform: keyof typeof CONTENT_PLATFORM_LABELS | null;
  format: keyof typeof CONTENT_FORMAT_LABELS | null;
}): string | null {
  const parts = [
    item.platform ? CONTENT_PLATFORM_LABELS[item.platform] : null,
    item.format ? CONTENT_FORMAT_LABELS[item.format] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
