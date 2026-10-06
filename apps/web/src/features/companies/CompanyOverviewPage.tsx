import { useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function CompanyOverviewPage() {
  const { companyId } = useParams();
  return (
    <>
      <PageHeader
        eyebrow={`Empresa · ${companyId}`}
        title="Resumen"
        description="Estado del análisis de marca, ADN y Pixel de esta empresa."
      />
      <EmptyState
        icon="overview"
        title="Sin datos de la empresa"
        description="El resumen mostrará el progreso del onboarding y del análisis cuando existan."
        stage="Etapas 4 y 6"
      />
    </>
  );
}
