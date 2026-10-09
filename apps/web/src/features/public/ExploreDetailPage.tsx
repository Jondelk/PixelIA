import { Link } from 'react-router';
import { experienceImages, type ExperienceKind } from '../../brand/experience';
import { ExperienceImg } from '../../components/ExperienceImg';
import { Icon } from '../../components/Icon';
import { EXPLORE_MODES } from './exploreContent';
import { PublicHeader } from './PublicHeader';
import { StartPixelActions } from './StartPixelActions';

/**
 * Detalle público de Pixel Personal o Pixel Enterprise (`/explore/personal|enterprise`). Solo
 * informa; empezar requiere cuenta y lo resuelve <StartPixelActions> sin crear nada al visitar.
 */
export function ExploreDetailPage({ kind }: { kind: ExperienceKind }) {
  const mode = EXPLORE_MODES[kind];
  const images = experienceImages[kind];

  return (
    <div className="min-h-dvh bg-canvas">
      <PublicHeader tone="page" />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="arrowLeft" className="size-4" /> Explorar
        </Link>

        <section className="mt-8 grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="overflow-hidden rounded-2xl border border-line bg-negro-cine">
            <ExperienceImg
              image={images.evolution}
              sizes="(min-width: 1024px) 55vw, 100vw"
              priority
              className="aspect-[16/9] size-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
              {mode.name}
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {mode.tagline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              {mode.description}
            </p>
            <div className="mt-8">
              <StartPixelActions kind={kind} />
            </div>
          </div>
        </section>

        <section
          aria-labelledby={`${kind}-capabilities`}
          className="mt-16 grid items-center gap-8 border-t border-line pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-14"
        >
          <div>
            <h2
              id={`${kind}-capabilities`}
              className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Qué hace Pixel por {kind === 'personal' ? 'ti' : 'tu marca'}
            </h2>
            <ul className="mt-8 space-y-4">
              {mode.capabilities.map((capability) => (
                <li key={capability} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                  <span className="mt-2 size-1.5 shrink-0 bg-fg" aria-hidden="true" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-line bg-negro-cine">
            <ExperienceImg
              image={images.final}
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="aspect-[16/9] size-full object-cover"
            />
            <figcaption className="border-t border-line px-5 py-4 text-sm font-medium text-blanco">
              {mode.companion}
            </figcaption>
          </figure>
        </section>
      </main>
    </div>
  );
}
