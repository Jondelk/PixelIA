import type { Company } from '@pixel/contracts';
import { pixelStatus, type PixelTone } from './pixelStatus';

const DOT: Record<PixelTone, string> = {
  idle: 'border border-subtle',
  progress: 'bg-subtle animate-pulse',
  learned: 'bg-muted',
  ready: 'bg-fg',
  error: 'bg-alert',
};

export function PixelStatusBadge({
  company,
}: {
  company: Pick<Company, 'status' | 'brandDnaVersion'>;
}) {
  const { label, tone } = pixelStatus(company);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`size-1.5 shrink-0 ${DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}
