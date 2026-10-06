import {
  CompanyListResponseSchema,
  CompanyResponseSchema,
  type Company,
  type CreateCompanyInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

export async function listCompanies(signal?: AbortSignal): Promise<Company[]> {
  return (await apiRequest('/api/companies', CompanyListResponseSchema, { signal })).companies;
}

export async function getCompany(companyId: string, signal?: AbortSignal): Promise<Company> {
  return (
    await apiRequest(`/api/companies/${encodeURIComponent(companyId)}`, CompanyResponseSchema, {
      signal,
    })
  ).company;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  return (
    await apiRequest('/api/companies', CompanyResponseSchema, { method: 'POST', body: input })
  ).company;
}
