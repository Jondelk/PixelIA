import { experienceImages, type ExperienceKind } from '../../brand/experience';
import { ExperienceImg } from '../../components/ExperienceImg';

/**
 * Columna visual del modal de acceso. Decorativa: el formulario es el contenido. El recorte mantiene
 * al personaje entero en una columna vertical.
 */
export function AuthVisual({ kind, className = '' }: { kind: ExperienceKind; className?: string }) {
  const image = experienceImages[kind].final;
  return (
    <div className={`overflow-hidden bg-negro-cine ${className}`} aria-hidden="true">
      <ExperienceImg
        image={image}
        sizes="(min-width: 768px) 440px, 100vw"
        priority
        decorative
        className="size-full object-cover"
      />
    </div>
  );
}
