import { AVATAR_MODEL_STATUS_LABELS, type AvatarModelResponse } from '@pixel/contracts';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { errorMessage } from '../../lib/api';
import { downloadUrl, modelFileUrl } from './avatarApi';

const seconds = (ms: number | null) => (ms === null ? null : `${Math.round(ms / 1000)} s`);

/**
 * Producción 3D del personaje (Pixel Sculpt): estado, construir/reconstruir y descargas.
 */
export function AvatarModelPanel({
  name,
  data,
  inProgress,
  onBuild,
}: {
  name: string;
  data: AvatarModelResponse | null;
  inProgress: boolean;
  onBuild: (force: boolean) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      await onBuild(force);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const model = data?.model ?? null;
  const available = data?.engine.available ?? false;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
          Modelo 3D profesional
        </h2>
        {model && (
          <span className="text-[11px] text-muted">{AVATAR_MODEL_STATUS_LABELS[model.status]}</span>
        )}
      </div>

      {!data ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4 text-fg" /> Consultando el estudio 3D…
        </p>
      ) : !available && !model ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          La producción 3D está desactivada en el servidor. Define{' '}
          <code className="text-fg">AVATAR_3D=on</code> en la API para esculpir el personaje.
          Mientras tanto se usa el avatar paramétrico.
        </p>
      ) : inProgress ? (
        <div className="mt-3 flex gap-3 text-sm text-muted" role="status">
          <Spinner className="mt-0.5 size-4 shrink-0 text-fg" />
          <p>
            Esculpiendo a <span className="text-fg">{name}</span>: forma, rostro, materiales y
            renders de estudio. Suele tardar menos de un minuto.
          </p>
        </div>
      ) : model?.status === 'ready' ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Esculpido en 3D
            {model.durationMs !== null && ` en ${seconds(model.durationMs)}`}. El .glb se abre en
            Blender, Maya, Cinema 4D, motores de juego y visores web, con su rig listo para animar.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {model.files.glb && (
              <a href={downloadUrl(model.files.glb)} className={buttonClasses('secondary')}>
                <Icon name="download" className="size-4" /> .glb
              </a>
            )}
            {model.files.cutout && (
              <a href={downloadUrl(model.files.cutout)} className={buttonClasses('secondary')}>
                <Icon name="download" className="size-4" /> PNG sin fondo
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {model?.status === 'failed'
            ? 'La última construcción no terminó.'
            : 'Convierte el concepto en un modelo 3D con acabados de estudio y renders para tu manual de marca.'}
        </p>
      )}

      {model?.status === 'failed' && model.error && (
        <div className="mt-3">
          <Alert>{model.error}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {available && !inProgress && (
        <Button
          variant={model?.status === 'ready' ? 'ghost' : 'primary'}
          className="mt-4 w-full"
          loading={busy}
          onClick={() => void build(model !== null)}
        >
          {!busy && <Icon name={model ? 'refresh' : 'create'} className="size-4" />}
          {model?.status === 'ready'
            ? 'Volver a modelar'
            : model?.status === 'failed'
              ? 'Reintentar'
              : 'Esculpir en 3D'}
        </Button>
      )}
    </section>
  );
}

/** Renders de estudio del personaje (vistas para presentar y para el manual de marca). */
export function AvatarRenders({ data, name }: { data: AvatarModelResponse | null; name: string }) {
  const files = data?.model?.status === 'ready' ? data.model.files : null;
  if (!files?.hero) return null;
  const views = [
    { url: files.front, label: 'Frente' },
    { url: files.threeQuarter, label: 'Tres cuartos' },
    { url: files.side, label: 'Perfil' },
  ].filter((view): view is { url: string; label: string } => Boolean(view.url));

  return (
    <section className="animate-rise overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 sm:px-8">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-subtle">
            Renders de estudio · Pixel Sculpt
          </p>
          <h2 className="mt-2 font-display text-lg font-bold tracking-tight">
            {name} en producción
          </h2>
        </div>
        <a href={downloadUrl(files.hero)} className={buttonClasses('ghost')}>
          <Icon name="download" className="size-4" /> PNG
        </a>
      </div>
      <img
        src={modelFileUrl(files.hero)}
        alt={`Render principal de ${name}`}
        className="mt-6 aspect-square w-full object-cover"
        loading="lazy"
      />
      {views.length > 0 && (
        <ul className="grid grid-cols-3 gap-px border-t border-line bg-line">
          {views.map((view) => (
            <li key={view.label} className="bg-surface">
              <a href={downloadUrl(view.url)} title={`Descargar vista: ${view.label}`}>
                <img
                  src={modelFileUrl(view.url)}
                  alt={`${name}: ${view.label.toLowerCase()}`}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </a>
              <p className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-subtle">
                {view.label}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
