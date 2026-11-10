import { companyInitials } from './pixelStatus';

/** Monograma de la empresa (las iniciales). El personaje real vive en /company/:id/pixel. */
export function CompanyAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-16 rounded-xl text-lg' : 'size-12 rounded-lg text-sm';
  return (
    <div
      className={`grid shrink-0 place-items-center border border-line-strong bg-elevated font-display font-bold text-fg ${box}`}
      aria-hidden="true"
    >
      {companyInitials(name)}
    </div>
  );
}
