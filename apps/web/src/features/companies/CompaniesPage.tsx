import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function CompaniesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Empresas"
        title="Empresas"
        description="Cada empresa tiene su propio Pixel, construido a partir del ADN de su marca."
      />
      <EmptyState
        icon="companies"
        title="Todavía no tienes empresas"
        description="La creación de empresas y el onboarding de marca se habilitan en la siguiente fase."
        stage="Etapa 4 · Empresas y onboarding"
      />
    </>
  );
}
