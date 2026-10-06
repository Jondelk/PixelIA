import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { useAuth, useCurrentUser } from '../features/auth/authContext';
import { companyInitials } from '../features/companies/pixelStatus';

export function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2.5 md:flex" title={user.email}>
        <span
          className="grid size-8 place-items-center rounded-full border border-line-strong bg-elevated text-[11px] font-semibold text-muted"
          aria-hidden="true"
        >
          {companyInitials(user.name)}
        </span>
        <span className="max-w-40 truncate text-sm text-muted">{user.name}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          setLeaving(true);
          void logout();
        }}
        disabled={leaving}
        className="rounded-lg p-2 text-subtle transition-colors hover:bg-white/[0.04] hover:text-fg disabled:opacity-60"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        {leaving ? (
          <Spinner className="size-[18px]" />
        ) : (
          <Icon name="logout" className="size-[18px]" />
        )}
      </button>
    </div>
  );
}
