import type { AvatarModelResponse, AvatarProfile, BrandDna } from '@pixel/contracts';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { companyBasePath } from '../../app/navigation';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { companyApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { getBrandBrain } from '../brand/brandApi';
import { useCompany } from '../companies/companyContext';
import { getAvatar, getAvatarModel, modelFileUrl } from '../pixel/avatarApi';
import { BrandManual, type ManualRenders } from './BrandManual';
import { chooseTypography, googleFontsUrl } from './manualModel';
import './manual.css';

interface ManualData {
  dna: BrandDna | null;
  avatar: AvatarProfile | null;
  model: AvatarModelResponse | null;
}

function rendersOf(model: AvatarModelResponse | null): ManualRenders | null {
  const files = model?.model?.status === 'ready' ? model.model.files : null;
  if (!files?.hero) return null;
  const url = (value: string | null) => (value ? modelFileUrl(value) : null);
  return {
    hero: url(files.hero),
    front: url(files.front),
    threeQuarter: url(files.threeQuarter),
    side: url(files.side),
    cutout: url(files.cutout),
  };
}

/** Carga la tipografía del manual (Google Fonts) mientras la página está abierta. */
function useFontStylesheet(href: string | null) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!href) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      void document.fonts.ready.then(() => setReady(true));
    };
    link.onerror = () => setReady(true);
    document.head.appendChild(link);
    return () => {
      link.remove();
      setReady(false);
    };
  }, [href]);
  return ready;
}

/**
 * Manual de marca de la empresa: se genera solo a partir del ADN (y del personaje, si existe).
 * "Descargar PDF" usa la impresión del navegador con páginas A4 apaisadas.
 */
export function BrandManualPage() {
  const { company } = useCompany();
  const { state, reload } = useResource(
    `manual:${company.id}:${company.brandDnaVersion ?? 0}:${company.avatarVersion ?? 0}`,
    async (signal): Promise<ManualData> => {
      const [brain, avatar, model] = await Promise.all([
        getBrandBrain(company.id, signal),
        company.avatarVersion
          ? getAvatar(companyApiBase(company.id), signal).then((res) => res.avatar)
          : Promise.resolve(null),
        // El manual no depende del modelo 3D: sin él usa la vista 2D del personaje.
        company.avatarVersion ? getAvatarModel(companyApiBase(company.id), signal).catch(() => null) : null,
      ]);
      return { dna: brain.brandDna, avatar, model };
    },
  );
  const base = companyBasePath(company.id);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Preparando el manual de marca…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;
  if (!state.data.dna) {
    return (
      <EmptyState
        title="El manual nace del ADN de marca"
        description="Completa el onboarding: en cuanto Pixel entienda la marca, su manual se genera solo."
        action={
          <Link to={`${base}/onboarding`} className={buttonClasses('primary')}>
            Ir al onboarding <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      />
    );
  }
  return <ManualView data={{ ...state.data, dna: state.data.dna }} base={base} />;
}

function ManualView({ data, base }: { data: ManualData & { dna: BrandDna }; base: string }) {
  const { dna, avatar, model } = data;
  const fontsHref = useMemo(() => googleFontsUrl(chooseTypography(dna).pairing), [dna]);
  const fontsReady = useFontStylesheet(fontsHref);
  const renders = rendersOf(model);
  const generatedAt = useMemo(() => new Date(), []);
  const building = model?.model?.status === 'queued' || model?.model?.status === 'building';

  const manual = (
    <BrandManual dna={dna} avatar={avatar} renders={renders} generatedAt={generatedAt} />
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            Manual de marca · ADN v{dna.version}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {dna.identity.name}, en un solo documento
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Esencia, voz, color, tipografía y personaje, generados a partir del ADN de la marca. Se
            actualiza solo cuando cambian el ADN o el personaje.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!avatar && (
            <Link to={`${base}/pixel`} className={buttonClasses('secondary')}>
              <Icon name="character" className="size-4" /> Crear el personaje
            </Link>
          )}
          <Button onClick={() => window.print()} disabled={!fontsReady}>
            <Icon name="print" className="size-4" /> Descargar PDF
          </Button>
        </div>
      </header>

      {avatar && !renders && (
        <p className="mb-6 flex items-center gap-2 text-sm text-muted">
          {building && <Spinner className="size-4 text-fg" />}
          {building
            ? 'El personaje se está esculpiendo en 3D: al terminar, sus renders aparecerán en el manual.'
            : 'El personaje aparece en su vista 2D. Escúlpelo en 3D desde «Personaje» para usar renders de estudio.'}
        </p>
      )}

      {manual}

      <p className="mt-6 text-center text-xs text-subtle">
        En el diálogo de impresión elige «Guardar como PDF». El tamaño (A4 horizontal) y los
        márgenes ya vienen configurados.
      </p>

      {createPortal(<div className="manual-print">{manual}</div>, document.body)}
    </div>
  );
}
