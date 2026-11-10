import type { Company } from '@pixel/contracts';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { PixelStatusBadge } from './PixelStatusBadge';

/*
 * «Tu Pixel» en el Inicio de la marca (Prompt 17): dice en qué estado está el Pixel y ofrece UNA
 * acción. ADN, Personaje y Chat ya están en la navegación y en el Pixel Dock, así que no se repiten.
 * Si el personaje existe, nunca sugiere que falta crearlo.
 */
export function BrandPixelCard({
  company,
  base,
  characterName,
}: {
  company: Pick<Company, 'status' | 'brandDnaVersion' | 'avatarVersion'>;
  base: string;
  /** Nombre del personaje, si ya se conoce (vista previa del workspace). */
  characterName: string | null;
}) {
  const next = company.avatarVersion
    ? { to: `${base}/pixel`, label: 'Personalizar', text: null }
    : company.brandDnaVersion
      ? {
          to: `${base}/pixel`,
          label: 'Crear el personaje de tu marca',
          text: 'Pixel ya conoce el ADN de esta marca. Ahora puede convertirlo en su personaje.',
        }
      : company.status === 'onboarding'
        ? {
            to: `${base}/onboarding`,
            label: 'Continuar onboarding',
            text: 'Pixel está aprendiendo esta marca. Completa los 8 pasos del onboarding para que genere su ADN.',
          }
        : {
            to: `${base}/onboarding`,
            label: 'Enseñarle tu marca a Pixel',
            text: 'Para que Pixel tome forma, primero estudiará el ADN de la marca en el onboarding. De ahí saldrán su voz, su criterio y el personaje de tu marca.',
          };

  return (
    <section aria-label="Tu Pixel" className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="font-display text-base font-bold">Tu Pixel</h2>
      {company.avatarVersion && characterName && (
        <p className="mt-3 font-display text-xl font-bold tracking-tight">{characterName}</p>
      )}
      <div className="mt-3">
        <PixelStatusBadge company={company} />
      </div>
      {next.text && <p className="mt-4 text-sm leading-relaxed text-muted">{next.text}</p>}
      <Link
        to={next.to}
        className={`${buttonClasses(company.avatarVersion ? 'secondary' : 'primary')} mt-5`}
      >
        {next.label} <Icon name="arrowRight" className="size-4" />
      </Link>
    </section>
  );
}
