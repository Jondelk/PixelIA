import type { CompanyDocument } from '../modules/companies/company.model.js';
import type { WorkspaceDocument } from '../modules/workspaces/workspace.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Lo establece requireAuth. */
      auth?: { userId: string };
      /** Workspace autorizado (requireWorkspaceAccess o requireCompanyAccess): contexto principal. */
      workspace?: WorkspaceDocument;
      /** Empresa enterprise autorizada (requireCompanyAccess o requireEnterpriseCompany). */
      company?: CompanyDocument;
    }
  }
}

export {};
