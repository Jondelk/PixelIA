import { PERSONAL_ONBOARDING_STEPS } from '@pixel/contracts';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon, type IconName } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { workspaceBasePath } from '../../app/navigation';
import { workspaceApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { AvatarStage } from '../avatar3d/AvatarStage';
import { getAvatar } from '../pixel/avatarApi';
import { useWorkspace } from '../workspaces/workspaceContext';

/**
 * Inicio de un Pixel Personal.
 * - Sin PersonalDNA: "Configura tu Pixel Personal" → onboarding.
 * - Con PersonalDNA: Tu Pixel, tu ADN personal y el chat (nada más por ahora).
 */
export function PersonalHomePage() {
  const { overview } = useWorkspace();
  const { workspace, personal } = overview;
  const base = workspaceBasePath(workspace.id);
  const done = personal?.completedSteps ?? 0;
  const total = PERSONAL_ONBOARDING_STEPS.length;

  if (!personal?.personalDnaVersion) {
    return (
      <section className="rounded-3xl border border-line bg-surface px-6 py-14 sm:px-14">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_240px]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
              Pixel Personal · {workspace.name}
            </p>
            <h1 className="mt-5 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
              Configura tu Pixel Personal
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
              Cuéntale a Pixel quién eres, qué quieres conseguir, a quién le hablas y cómo trabajas.
              Con eso será tu director creativo personal: ordenará tus ideas, orientará tu contenido
              y te ayudará a decidir con tu propio criterio.
            </p>
            <Link
              to={`${base}/personal/onboarding`}
              className={`${buttonClasses('primary')} mt-10`}
            >
              {done === 0 ? 'Empezar' : `Continuar · ${done} de ${total} pasos`}
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <p className="mt-4 text-xs text-subtle">8 pasos · se guarda a medida que avanzas.</p>
          </div>
          <Pixi size={200} className="mx-auto max-lg:hidden" />
        </div>
      </section>
    );
  }

  return <PersonalHome name={personal.name ?? workspace.name} workspaceId={workspace.id} />;
}

function PersonalHome({ name, workspaceId }: { name: string; workspaceId: string }) {
  const base = workspaceBasePath(workspaceId);
  const { state } = useResource(`avatar:workspace:${workspaceId}`, (signal) =>
    getAvatar(workspaceApiBase(workspaceId), signal),
  );
  const avatar = state.status === 'success' ? state.data.avatar : null;
  const firstName = name.split(' ')[0] ?? name;

  return (
    <>
      <div className="mb-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
          Pixel Personal
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
          Hola, {firstName}.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          Tu director creativo personal ya te conoce. ¿Por dónde seguimos?
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="h-72 border-b border-line">
            {avatar ? (
              <AvatarStage avatar={avatar} state="idle" interactive={false} className="!h-full" />
            ) : (
              <div className="grid h-full place-items-center">
                <Pixi size={120} />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <h2 className="font-display text-base font-bold">Tu Pixel</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
              {avatar
                ? `${avatar.name}: ${avatar.concept}`
                : 'Pixel puede convertir tu ADN personal en un personaje 3D único, sin caricaturas de tu oficio.'}
            </p>
            <Link to={`${base}/pixel`} className={`${buttonClasses('secondary')} mt-6 self-start`}>
              {avatar ? 'Ver mi personaje' : 'Crear mi personaje'}
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </section>

        <div className="grid gap-5">
          <HomeCard
            to={`${base}/personal/dna`}
            icon="brand"
            title="Tu ADN personal"
            text="Así te entiende Pixel: tu identidad, tus objetivos, tu audiencia, tu estilo y cómo trabajas."
            cta="Ver mi ADN"
          />
          <HomeCard
            to={`${base}/chat`}
            icon="chat"
            title="Chat"
            text="Pídele ideas, ordena un proyecto o decide entre dos propuestas: responde con tu criterio."
            cta="Hablar con Pixel"
            primary
          />
        </div>
      </div>
    </>
  );
}

function HomeCard({
  to,
  icon,
  title,
  text,
  cta,
  primary = false,
}: {
  to: string;
  icon: IconName;
  title: string;
  text: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="flex items-center gap-2.5 font-display text-base font-bold">
        <Icon name={icon} className="size-[18px] text-subtle" /> {title}
      </h2>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{text}</p>
      <Link
        to={to}
        className={`${buttonClasses(primary ? 'primary' : 'secondary')} mt-6 self-start`}
      >
        {cta} <Icon name="arrowRight" className="size-4" />
      </Link>
    </section>
  );
}
