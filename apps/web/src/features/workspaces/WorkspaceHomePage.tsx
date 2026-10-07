import { WORKSPACE_TYPE_LABELS } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { useWorkspace } from './workspaceContext';

/**
 * Pantalla de un Pixel que aún no tiene funciones propias:
 * - Personal: preparado para configurarse en la siguiente etapa (sin datos inventados).
 * - Enterprise sin empresa: invita a completar la empresa (flujo Enterprise existente).
 */
export function WorkspaceHomePage({ section }: { section?: 'chat' | 'pixel' }) {
  const { overview } = useWorkspace();
  const { workspace } = overview;

  if (workspace.type === 'enterprise') {
    return (
      <Hero
        eyebrow={`${WORKSPACE_TYPE_LABELS.enterprise} · ${workspace.name}`}
        title="Este Pixel aún no tiene empresa."
      >
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Completa los datos de la empresa para que Pixel estudie su marca y empiece a crear con
          ella.
        </p>
        <Link
          to={`/companies/new?workspace=${encodeURIComponent(workspace.id)}`}
          className={`${buttonClasses('primary')} mt-10`}
        >
          Configurar la empresa <Icon name="arrowRight" className="size-4" />
        </Link>
      </Hero>
    );
  }

  return (
    <Hero
      eyebrow={`Pixel ${WORKSPACE_TYPE_LABELS.personal} · ${workspace.name}`}
      title="Tu Pixel Personal está listo para configurarse."
    >
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
        {section
          ? 'Esta parte de tu Pixel Personal llegará con su configuración.'
          : 'Pronto podrás contarle cómo trabajas para que organice tu contenido, tus proyectos y tu forma de crear.'}
      </p>
      <p className="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
        Próximamente
      </p>
    </Hero>
  );
}

function Hero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface px-6 py-14 sm:px-14">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_240px]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>
          <h1 className="mt-5 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
            {title}
          </h1>
          {children}
        </div>
        <Pixi size={200} className="mx-auto max-lg:hidden" />
      </div>
    </section>
  );
}
