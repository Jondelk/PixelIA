import type { WorkspaceType } from '@pixel/contracts';
import type { Types } from 'mongoose';
import type { WorkspaceDocument } from '../../workspaces/workspace.model.js';
import type { HistoryMessage, PixelContext } from '../pixelContext.builder.js';

/*
 * PixelContextBuilder por estrategia (docs/WORKSPACES.md):
 *
 *   Message → workspace autorizado → resolveContextBuilder(workspace.type)
 *           → EnterpriseContextBuilder (Company → BrandDNA)
 *           | PersonalContextBuilder (PersonalProfile → PersonalDNA) → AIProvider
 *
 * Cada estrategia recibe el workspace YA autorizado (nunca un id del cliente) y carga solo datos de
 * ese workspace. El AIProvider recibe el contexto ya preparado: nunca ve companyId ni ids de
 * perfiles personales.
 */

export interface ContextRequest {
  /** Workspace autorizado por requireWorkspaceAccess / requireCompanyAccess. */
  workspace: WorkspaceDocument;
  /** Mensajes previos de la conversación (del mismo workspace), del más antiguo al más reciente. */
  history: HistoryMessage[];
  userMessage: string;
  historyLimit: number;
  /** Zona horaria si el workspace no tiene una (define el "hoy" de la dirección del día). */
  defaultTimezone?: string;
}

export type ContextResult =
  | {
      status: 'ready';
      context: PixelContext;
      /** Enterprise: empresa del workspace (se guarda en los mensajes por compatibilidad). */
      companyId: Types.ObjectId | null;
      /** ADN con el que responde: BrandDNA (enterprise) o PersonalDNA (personal); el otro es null. */
      meta: {
        brandDnaVersion: number | null;
        personalDnaVersion: number | null;
        avatarVersion: number | null;
      };
    }
  | {
      /** El workspace aún no tiene el contexto mínimo para que Pixel responda. */
      status: 'not_configured';
      reason: string;
      message: string;
    };

export interface ContextBuilder {
  readonly type: WorkspaceType;
  build(request: ContextRequest): Promise<ContextResult>;
}

export function notConfigured(reason: string, message: string): ContextResult {
  return { status: 'not_configured', reason, message };
}
