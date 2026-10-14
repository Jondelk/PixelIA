import { Link } from 'react-router';
import type { ExperienceImage } from '../../brand/experience';
import { ExperienceImg } from '../../components/ExperienceImg';
import { Icon } from '../../components/Icon';

/**
 * Tarjeta visual de Explorar. El texto es HTML y nunca tapa la ilustración:
 * - `stacked`: imagen 16:9 arriba y texto debajo (tarjetas principales).
 * - `split`: texto a un lado e imagen al otro desde `sm` (tarjetas secundarias); apilada en móvil.
 * La imagen conserva su proporción y su punto de recorte para que el personaje se vea entero.
 */
export function ExperienceCard({
  to,
  image,
  eyebrow,
  title,
  action,
  layout,
  priority = false,
  sizes,
  headingLevel = 'h2',
}: {
  to: string;
  image: ExperienceImage;
  eyebrow: string;
  title: string;
  action: string;
  layout: 'stacked' | 'split';
  /** Imagen del primer viewport: se carga de inmediato. El resto, en diferido. */
  priority?: boolean;
  sizes: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  const split = layout === 'split';
  return (
    <Link
      to={to}
      className={`group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong ${
        split ? 'sm:grid sm:grid-cols-[2fr_3fr] lg:grid-cols-2' : ''
      }`}
    >
      <div
        className={`relative aspect-[16/9] overflow-hidden bg-negro-cine ${
          split ? 'sm:order-2 sm:aspect-auto sm:min-h-52' : ''
        }`}
      >
        <ExperienceImg
          image={image}
          sizes={sizes}
          priority={priority}
          className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-pxl motion-safe:group-hover:scale-[1.02]"
        />
      </div>
      <div
        className={`flex flex-col p-5 sm:p-7 ${split ? 'sm:order-1 sm:justify-center' : 'lg:p-8'}`}
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
        <Heading className="mt-3 font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">
          {title}
        </Heading>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-fg">
          {action}
          <Icon
            name="arrowRight"
            className="size-4 transition-transform duration-300 ease-pxl motion-safe:group-hover:translate-x-1"
          />
        </span>
      </div>
    </Link>
  );
}
