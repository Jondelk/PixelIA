import type { WorkspaceOverview } from '@pixel/contracts';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { workspaceBasePath } from '../../app/navigation';
import { CompanyAvatar } from '../companies/CompanyAvatar';
import { StatusBadge } from '../companies/PixelStatusBadge';
import { PixelPreview } from '../pixel/PixelPreview';
import { resolveAccent } from '../presence/workspaceAccent';
import { workspaceStatus } from './workspaceStatus';

/**
 * Un Pixel en "Tus Pixels" (Prompt 17). Con personaje, su miniatura 2D (SVG: con muchos Pixels no se
 * abre ningún contexto WebGL); sin él, el monograma de siempre (nunca un personaje inventado). Su
 * acento solo marca un detalle (el borde de la miniatura). La entrada es /workspace/:workspaceId.
 */
export function WorkspaceCard({ overview }: { overview: WorkspaceOverview }) {
  const { workspace, company, personal, avatar } = overview;
  const status = workspaceStatus(overview);
  const accent = resolveAccent(avatar).color;
  const name = personal?.name ?? company?.name ?? workspace.name;
  return (
    <Link
      to={workspaceBasePath(workspace.id)}
      aria-label={`${name}, ${status.typeLabel}: ${status.label}`}
      className="group flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-elevated"
    >
      {avatar ? (
        <span
          className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-canvas"
          style={accent ? { borderColor: accent } : undefined}
        >
          <PixelPreview key={avatar.id} profile={avatar} className="h-full w-full" />
        </span>
      ) : (
        <CompanyAvatar name={name} size="lg" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-bold tracking-tight">{name}</h3>
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
          {status.typeLabel}
          {company && <span className="normal-case tracking-normal"> · {company.industry}</span>}
        </p>
        <div className="mt-3">
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
      </div>
      <Icon
        name="arrowRight"
        className="size-4 shrink-0 text-subtle transition-colors group-hover:text-fg"
      />
    </Link>
  );
}
