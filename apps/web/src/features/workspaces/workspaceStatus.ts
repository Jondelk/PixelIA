import { WORKSPACE_TYPE_LABELS, type WorkspaceOverview } from '@pixel/contracts';
import { pixelStatus, type PixelTone } from '../companies/pixelStatus';

/** Cómo se presenta un Pixel (workspace) en "Tus Pixels". */
export function workspaceStatus({ workspace, company }: WorkspaceOverview): {
  typeLabel: string;
  label: string;
  tone: PixelTone;
} {
  const typeLabel = WORKSPACE_TYPE_LABELS[workspace.type];
  if (workspace.status === 'archived') return { typeLabel, label: 'Archivado', tone: 'idle' };
  if (workspace.type === 'personal') return { typeLabel, label: 'Próximamente', tone: 'idle' };
  if (!company) return { typeLabel, label: 'Sin configurar', tone: 'idle' };
  if (company.status === 'ready') return { typeLabel, label: 'Configurado', tone: 'ready' };
  return { typeLabel, ...pixelStatus(company) };
}
