import type { CompanyStatus } from '@pixel/contracts';
import { pixelStatus, type PixelTone } from './pixelStatus';

const DOT: Record<PixelTone, string> = {
  idle: 'bg-subtle',
  progress: 'bg-electric animate-pulse',
  ready: 'bg-accent shadow-[0_0_8px_var(--color-accent)]',
  error: 'bg-rose-500',
};

export function PixelStatusBadge({ status }: { status: CompanyStatus }) {
  const { label, tone } = pixelStatus(status);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`size-1.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}
