import type { CompanyDocument } from '../modules/companies/company.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Lo establece requireAuth. */
      auth?: { userId: string };
      /** Lo establece requireCompanyAccess: empresa ya validada como propiedad del usuario. */
      company?: CompanyDocument;
    }
  }
}

export {};
