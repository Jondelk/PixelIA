import type { WorkspaceOverview } from '@pixel/contracts';
import type { PixelTone } from '../companies/pixelStatus';

/*
 * Cómo se presenta un Pixel en "Tus Pixels" (Prompt 17: lenguaje humano). Es un selector de Pixel,
 * no un panel: nombre, tipo y un estado corto («Listo», «Configurar marca»…), sin métricas.
 */

const TYPE_LABELS = { personal: 'Pixel Personal', enterprise: 'Pixel Enterprise' } as const;

export function workspaceStatus({ workspace, company, personal }: WorkspaceOverview): {
  typeLabel: string;
  label: string;
  tone: PixelTone;
} {
  const typeLabel = TYPE_LABELS[workspace.type];
  if (workspace.status === 'archived') return { typeLabel, label: 'Archivado', tone: 'idle' };
  if (workspace.type === 'personal') {
    // Listo = Pixel ya generó su PersonalDNA; antes, "Configurar" (con avance si lo hay).
    if (personal?.personalDnaVersion) return { typeLabel, label: 'Listo', tone: 'ready' };
    return personal?.completedSteps
      ? { typeLabel, label: 'Configurando', tone: 'progress' }
      : { typeLabel, label: 'Configurar', tone: 'idle' };
  }
  if (!company) return { typeLabel, label: 'Configurar marca', tone: 'idle' };
  if (company.status === 'failed') {
    return { typeLabel, label: 'El análisis necesita reintentarse', tone: 'error' };
  }
  if (company.brandDnaVersion) {
    return company.avatarVersion
      ? { typeLabel, label: 'Listo', tone: 'ready' }
      : { typeLabel, label: 'ADN listo · personaje pendiente', tone: 'learned' };
  }
  return company.status === 'onboarding'
    ? { typeLabel, label: 'Configurando marca', tone: 'progress' }
    : { typeLabel, label: 'Configurar marca', tone: 'idle' };
}
