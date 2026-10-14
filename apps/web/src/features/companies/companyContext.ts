import type { Company } from '@pixel/contracts';
import { useOutletContext } from 'react-router';

export interface CompanyOutletContext {
  company: Company;
  reload: () => void;
}

/** Empresa activa, cargada y autorizada por <CompanyLayout>. */
export function useCompany(): CompanyOutletContext {
  return useOutletContext<CompanyOutletContext>();
}
