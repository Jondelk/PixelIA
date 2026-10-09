import { DEFAULT_TIMEZONE } from '@pixel/contracts';
import { toAvatarProfileDTO, AvatarProfileModel } from '../../avatars/avatarProfile.model.js';
import { BrandDnaModel, toBrandDnaDTO } from '../../brand-dna/brandDna.model.js';
import { CreativeMemoryModel } from '../../creative-memory/creativeMemory.model.js';
import { workspaceTimezone } from '../../daily-director/dailyTime.js';
import { getOperationsStatus } from '../../operations/summary.service.js';
import { findWorkspaceCompany } from '../../workspaces/workspace.service.js';
import { buildPixelContext } from '../pixelContext.builder.js';
import { notConfigured, type ContextBuilder } from './contextBuilder.js';

/** Memorias activas más recientes que entran al contexto. */
const MEMORY_LIMIT = 10;

/**
 * Enterprise: Workspace → Company → BrandDNA (+ AvatarProfile, CreativeMemory y el estado operativo
 * del workspace). Mismas comprobaciones y mensajes que el chat anterior (buildPixelContext). Del
 * trabajo (Projects, Tasks, ContentItems) solo entran CONTEOS del workspace activo: nunca listas,
 * nombres ni datos de otro workspace.
 */
export const enterpriseContextBuilder: ContextBuilder = {
  type: 'enterprise',

  async build({ workspace, history, userMessage, historyLimit, defaultTimezone }) {
    const company = await findWorkspaceCompany(workspace);
    if (!company) {
      return notConfigured(
        'enterprise_company_missing',
        'Este Pixel de empresa aún no tiene una empresa configurada',
      );
    }
    if (!company.brandDnaVersion) {
      return notConfigured(
        'brand_dna_missing',
        'Pixel aún no conoce esta marca: completa el onboarding para conversar con él',
      );
    }

    const dnaDoc = await BrandDnaModel.findOne({
      companyId: company._id,
      version: company.brandDnaVersion,
    });
    if (!dnaDoc) {
      return notConfigured('brand_dna_missing', 'No se encontró el ADN de marca vigente');
    }
    const brandDna = toBrandDnaDTO(dnaDoc);

    const [avatarDoc, memories, operations] = await Promise.all([
      company.avatarVersion
        ? AvatarProfileModel.findOne({ workspaceId: workspace._id, version: company.avatarVersion })
        : null,
      CreativeMemoryModel.find({ workspaceId: workspace._id, active: true })
        .sort({ createdAt: -1 })
        .limit(MEMORY_LIMIT)
        .select({ content: 1 })
        .lean(),
      getOperationsStatus(workspace, {
        timezone: workspaceTimezone(workspace, defaultTimezone ?? DEFAULT_TIMEZONE),
      }),
    ]);
    const avatar = avatarDoc ? toAvatarProfileDTO(avatarDoc) : null;

    const context = buildPixelContext({
      company: { name: company.name },
      brandDna,
      avatar,
      memories: memories.map((memory) => memory.content),
      operations,
      history,
      userMessage,
      limits: { historyMessages: historyLimit },
    });

    return {
      status: 'ready',
      context,
      companyId: company._id,
      meta: {
        brandDnaVersion: brandDna.version,
        personalDnaVersion: null,
        avatarVersion: avatar?.version ?? null,
      },
    };
  },
};
