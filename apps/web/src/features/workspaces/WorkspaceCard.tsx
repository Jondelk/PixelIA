import type { WorkspaceOverview } from '@pixel/contracts';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { workspaceBasePath } from '../../app/navigation';
import { CompanyAvatar } from '../companies/CompanyAvatar';
import { StatusBadge } from '../companies/PixelStatusBadge';
import { workspaceStatus } from './workspaceStatus';

/** Un Pixel (workspace) en "Tus Pixels". La entrada es siempre /workspace/:workspaceId. */
export function WorkspaceCard({ overview }: { overview: WorkspaceOverview }) {
  const { workspace, company } = overview;
  const status = workspaceStatus(overview);
  return (
    <Link
      to={workspaceBasePath(workspace.id)}
      className="group flex h-full flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong hover:bg-elevated"
    >
      <div className="flex items-start gap-4">
        <CompanyAvatar name={workspace.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold tracking-tight">
            {workspace.name}
          </h3>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
            {status.typeLabel}
            {company && <span className="normal-case tracking-normal"> · {company.industry}</span>}
          </p>
        </div>
        <Icon
          name="arrowRight"
          className="mt-1 size-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
        />
      </div>
      <StatusBadge label={status.label} tone={status.tone} />
    </Link>
  );
}
