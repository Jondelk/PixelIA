import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useCompany } from '../companies/companyContext';

export function BrandPage() {
  const { company } = useCompany();
  return (
    <>
      <PageHeader
        eyebrow={company.name}
        title="ADN de marca"
        description="Identidad, audiencia, personalidad, voz, criterio creativo y dirección visual: lo que la empresa es."
      />
      <EmptyState
        icon="dna"
        title="El ADN aún no se ha generado"
        description="Pixel generará el BrandDNA a partir del onboarding de la marca."
        stage="Etapa 6 · Análisis de marca"
      />
    </>
  );
}
