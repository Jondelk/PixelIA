import { companyInitials } from './pixelStatus';

/**
 * Marcador del futuro Pixel de la empresa: monograma sobre la cuadrícula de Pixel.
 * El avatar real (derivado del ADN de marca) llega en la Etapa 7.
 */
export function CompanyAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-16 rounded-2xl text-lg' : 'size-12 rounded-xl text-sm';
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden border border-line-strong bg-elevated font-display font-semibold text-fg ${box}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 grid grid-cols-2 gap-px opacity-40">
        <span className="bg-line" />
        <span className="bg-accent/20" />
        <span className="bg-line" />
        <span className="bg-line" />
      </div>
      <span className="relative">{companyInitials(name)}</span>
    </div>
  );
}
