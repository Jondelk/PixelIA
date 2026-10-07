import type { Types } from 'mongoose';
import { CompanyModel } from '../../src/modules/companies/company.model.js';

/** Workspace enterprise de una empresa (para consultar recursos aislados por workspaceId). */
export async function workspaceIdOf(companyId: string): Promise<Types.ObjectId> {
  const company = await CompanyModel.findOne({ _id: companyId }).select({ workspaceId: 1 });
  if (!company?.workspaceId) throw new Error(`La empresa ${companyId} no tiene workspace`);
  return company.workspaceId;
}
