import { experienceImages } from '../../brand/experience';
import { EXPLORE_MODES } from './exploreContent';
import { ExperienceCard } from './ExperienceCard';
import { PublicHeader } from './PublicHeader';

/**
 * Portada pública "Explorar Pixel" (`/explore`): dos tarjetas principales —Personal y Enterprise—
 * con la transformación de Pixi y dos secundarias con el personaje final. Visitarla no crea ni
 * cambia ningún Pixel: las tarjetas llevan a su detalle público.
 */
export function ExplorePage() {
  const { personal, enterprise } = EXPLORE_MODES;
  return (
    <div className="min-h-dvh bg-canvas">
      <PublicHeader tone="page" />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <header className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            Explorar Pixel
          </p>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Un Pixel para cada forma de crear.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Para tus ideas o para tu empresa: elige por dónde empezar.
          </p>
        </header>

        <section aria-label="Modos de Pixel" className="mt-10 grid gap-5 lg:grid-cols-2">
          {[personal, enterprise].map((mode) => (
            <ExperienceCard
              key={mode.kind}
              to={mode.path}
              image={experienceImages[mode.kind].evolution}
              eyebrow={mode.name}
              title={mode.tagline}
              action={`Conocer ${mode.name}`}
              layout="stacked"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          ))}
        </section>

        <section aria-labelledby="explore-characters" className="mt-16">
          <h2
            id="explore-characters"
            className="text-xs font-medium uppercase tracking-[0.2em] text-subtle"
          >
            Tu personaje en Pixel
          </h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {[personal, enterprise].map((mode) => (
              <ExperienceCard
                key={mode.kind}
                to={mode.path}
                image={experienceImages[mode.kind].final}
                eyebrow={mode.name}
                title={mode.companion}
                action="Ver detalles"
                layout="split"
                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 60vw, 100vw"
                headingLevel="h3"
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
