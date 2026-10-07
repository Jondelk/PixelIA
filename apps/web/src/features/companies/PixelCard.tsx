import type { Company } from '@pixel/contracts';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { companyBasePath } from '../../app/navigation';
import { CompanyAvatar } from './CompanyAvatar';
import { PixelStatusBadge } from './PixelStatusBadge';

/** Tarjeta de una empresa en el dashboard. */
export function PixelCard({ company }: { company: Company }) {
  return (
    <Link
      to={companyBasePath(company.id)}
      className="group flex h-full flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong hover:bg-elevated"
    >
      <div className="flex items-start gap-4">
        <CompanyAvatar name={company.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold tracking-tight">
            {company.name}
          </h3>
          <p className="truncate text-sm text-subtle">{company.industry}</p>
        </div>
        <Icon
          name="arrowRight"
          className="mt-1 size-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
        />
      </div>
      <PixelStatusBadge company={company} />
    </Link>
  );
}

export function PixelCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6"
      aria-hidden="true"
    >
      <div className="flex items-start gap-4">
        <div className="size-12 animate-pulse rounded-lg bg-elevated" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 w-2/3 animate-pulse rounded bg-elevated" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-elevated" />
        </div>
      </div>
      <div className="h-3 w-1/2 animate-pulse rounded bg-elevated" />
    </div>
  );
}
