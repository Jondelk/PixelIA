import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { experienceImages, type ExperienceKind } from '../../brand/experience';
import { BrandLogo } from '../../components/BrandLogo';
import { ExperienceImg } from '../../components/ExperienceImg';

/**
 * Páginas /login y /register (alternativa al modal de la portada): el personaje a la izquierda,
 * entero y sin texto encima, y el formulario a la derecha. En pantallas pequeñas solo el formulario.
 */
export function AuthLayout({
  kind = 'personal',
  children,
}: {
  kind?: ExperienceKind;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between gap-10 border-r border-line bg-negro-cine p-12 text-blanco lg:flex xl:p-14">
        <Link to="/" className="self-start rounded-lg" aria-label="Pixel · inicio">
          <BrandLogo height={30} onDark decorative />
        </Link>
        <div className="max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-blanco/10">
            <ExperienceImg
              image={experienceImages[kind].final}
              sizes="50vw"
              priority
              decorative
              className="aspect-[16/9] size-full object-cover"
            />
          </div>
          <p className="mt-10 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-blanco/75">
            <span className="size-2 shrink-0 bg-amarillo" aria-hidden="true" />
            Pixel · director creativo
          </p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight">
            Tu mundo, potenciado por Pixel.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-blanco/85">
            Un espacio para tus ideas. Un sistema para tu empresa.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-blanco/60">
          Tecnología creativa y entretenimiento
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-14 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <Link to="/" className="inline-flex rounded-lg" aria-label="Pixel · inicio">
              <BrandLogo height={28} decorative />
            </Link>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
