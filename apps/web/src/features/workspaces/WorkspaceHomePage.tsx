import { WORKSPACE_TYPE_LABELS } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { PersonalChatPage } from '../personal/PersonalChatPage';
import { PersonalHomePage } from '../personal/PersonalHomePage';
import { PersonalPixelPage } from '../personal/PersonalPixelPage';
import { useWorkspace } from './workspaceContext';

/**
 * Pantallas de /workspace/:workspaceId[/pixel|/chat] según el tipo:
 * - Personal: Inicio, Mi Pixel y Chat del Pixel Personal.
 * - Enterprise sin empresa: invita a completar la empresa (flujo Enterprise existente). Con
 *   empresa, WorkspaceLayout ya redirigió a /company/:companyId.
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

  // Pixel Personal: Inicio, Mi Pixel y Chat (Mi ADN y el onboarding tienen sus propias rutas).
  if (section === 'pixel') return <PersonalPixelPage />;
  if (section === 'chat') return <PersonalChatPage />;
  return <PersonalHomePage />;
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
