import type { GuardianResourceType } from '@pixel/contracts';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { evaluateWithGuardian } from './guardianApi';
import { presenceAfterReview } from './guardianLogic';
import { usePixelPresence } from '../presence/presenceContext';

/**
 * "Revisar con Guardian" desde Campaña, Plan de contenido o Contenido: evalúa el recurso y abre el
 * informe. Solo se muestra donde exista la capacidad (la pantalla lo envuelve en FeatureOnly o lo
 * decide con las capacidades).
 */
export function ReviewWithGuardian({
  workspaceId,
  base,
  resourceType,
  resourceId,
  variant = 'secondary',
  label = 'Revisar con Guardian',
}: {
  workspaceId: string;
  base: string;
  resourceType: Exclude<GuardianResourceType, 'copy' | 'pixel_proposal' | 'campaign_strategy'>;
  resourceId: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
}) {
  const navigate = useNavigate();
  const presence = usePixelPresence();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          presence.review();
          try {
            const report = await evaluateWithGuardian(workspaceId, { resourceType, resourceId });
            presence.send(presenceAfterReview(report.status));
            navigate(`${base}/guardian/reports/${report.id}`);
          } catch (err) {
            presence.fail();
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <Icon name="guardian" className="size-4" /> {label}
      </Button>
      {error && <span className="text-xs text-muted">{error}</span>}
    </span>
  );
}
