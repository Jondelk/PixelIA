import type { ExperienceImage } from '../brand/experience';

/**
 * Imagen de la experiencia de entrada con `srcSet` (original y variante de 960 px), proporción
 * reservada y su punto de recorte. Fuera del primer viewport se carga en diferido.
 */
export function ExperienceImg({
  image,
  sizes,
  priority = false,
  decorative = false,
  className = '',
}: {
  image: ExperienceImage;
  sizes: string;
  /** Visible al cargar la página: se pide de inmediato y con prioridad alta. */
  priority?: boolean;
  /** Si el texto de alrededor ya lo describe todo (p. ej. el acceso), `alt` vacío. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={decorative ? '' : image.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      // Las del primer viewport se pintan en cuanto llegan; el resto, sin bloquear.
      decoding={priority ? 'auto' : 'async'}
      className={className}
      style={{ objectPosition: image.focus }}
    />
  );
}
