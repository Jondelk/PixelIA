import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { workspaceBasePath } from '../../app/navigation';
import { ApiRequestError, errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useCurrentUser } from '../auth/authContext';
import { createWorkspace, listWorkspaces } from './workspacesApi';

/** "¿Cómo quieres usar Pixel?": elige entre Pixel Personal y Pixel Enterprise. */
export function NewPixelPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { state } = useResource('workspaces', listWorkspaces);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personal =
    state.status === 'success'
      ? state.data.find((item) => item.workspace.type === 'personal')
      : undefined;

  async function createPersonal() {
    setCreating(true);
    setError(null);
    try {
      const name = user.name.trim().length >= 2 ? user.name.trim() : 'Mi Pixel Personal';
      const { workspace } = await createWorkspace({ type: 'personal', name });
      navigate(workspaceBasePath(workspace.id));
    } catch (err) {
      let failure: unknown = err;
      // Ya existía (p. ej. creado en otra pestaña): se abre el que hay.
      if (err instanceof ApiRequestError && err.status === 409) {
        try {
          const existing = (await listWorkspaces()).find(
            (item) => item.workspace.type === 'personal',
          );
          if (existing) {
            navigate(workspaceBasePath(existing.workspace.id));
            return;
          }
        } catch (lookupError) {
          failure = lookupError;
        }
      }
      // Pase lo que pase, el botón vuelve a estar disponible y se ve el error.
      setError(errorMessage(failure));
      setCreating(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
      >
        <Icon name="arrowLeft" className="size-4" /> Tus Pixels
      </Link>
      <PageHeader eyebrow="Nuevo Pixel" title="¿Cómo quieres usar Pixel?" />

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <ModeCard
          label="Personal"
          title="Tu director creativo personal."
          description="Organiza tu contenido, proyectos y forma de trabajar."
        >
          {personal ? (
            <Link
              to={workspaceBasePath(personal.workspace.id)}
              className={buttonClasses('secondary', 'w-full')}
            >
              Abrir mi Pixel Personal <Icon name="arrowRight" className="size-4" />
            </Link>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              loading={creating}
              disabled={state.status === 'loading'}
              onClick={() => void createPersonal()}
            >
              Crear Pixel Personal
            </Button>
          )}
        </ModeCard>

        <ModeCard
          label="Empresa"
          title="El director creativo de tu marca."
          description="Aprende su ADN, protege su identidad y ayuda a crear."
        >
          <Link to="/companies/new" className={buttonClasses('primary', 'w-full')}>
            Crear Pixel Enterprise <Icon name="arrowRight" className="size-4" />
          </Link>
        </ModeCard>
      </div>
    </div>
  );
}

function ModeCard({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">{label}</p>
      <h2 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">{title}</h2>
      <p className="mt-4 flex-1 text-[15px] leading-relaxed text-muted">{description}</p>
      <div className="mt-10">{children}</div>
    </section>
  );
}
