import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useCompany } from '../companies/companyContext';

export function PixelPage() {
  const { company } = useCompany();
  return (
    <>
      <PageHeader
        eyebrow={company.name}
        title="Pixel"
        description="El avatar 3D de esta empresa, derivado de su ADN de marca."
      />
      <EmptyState
        icon="pixel"
        title="Este Pixel todavía no tiene forma"
        description="El avatar 3D se renderizará a partir del AvatarProfile, junto con la explicación de cada decisión visual."
        stage="Etapa 7 · Avatar 3D"
      />
    </>
  );
}
