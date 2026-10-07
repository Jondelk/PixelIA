import { toAvatarProfileDTO, AvatarProfileModel } from '../../avatars/avatarProfile.model.js';
import { BrandDnaModel, toBrandDnaDTO } from '../../brand-dna/brandDna.model.js';
import { CreativeMemoryModel } from '../../creative-memory/creativeMemory.model.js';
import { findWorkspaceCompany } from '../../workspaces/workspace.service.js';
import { buildPixelContext } from '../pixelContext.builder.js';
import { notConfigured, type ContextBuilder } from './contextBuilder.js';

/** Memorias activas más recientes que entran al contexto. */
const MEMORY_LIMIT = 10;

/**
 * Enterprise: Workspace → Company → BrandDNA (+ AvatarProfile y CreativeMemory del workspace).
 * Mantiene el comportamiento del chat anterior: mismas comprobaciones, mismos mensajes y el mismo
 * prompt (buildPixelContext).
 */
export const enterpriseContextBuilder: ContextBuilder = {
  type: 'enterprise',

  async build({ workspace, history, userMessage, historyLimit }) {
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

    const [avatarDoc, memories] = await Promise.all([
      company.avatarVersion
        ? AvatarProfileModel.findOne({ workspaceId: workspace._id, version: company.avatarVersion })
        : null,
      CreativeMemoryModel.find({ workspaceId: workspace._id, active: true })
        .sort({ createdAt: -1 })
        .limit(MEMORY_LIMIT)
        .select({ content: 1 })
        .lean(),
    ]);
    const avatar = avatarDoc ? toAvatarProfileDTO(avatarDoc) : null;

    const context = buildPixelContext({
      company: { name: company.name },
      brandDna,
      avatar,
      memories: memories.map((memory) => memory.content),
      history,
      userMessage,
      limits: { historyMessages: historyLimit },
    });

    return {
      status: 'ready',
      context,
      companyId: company._id,
      meta: { brandDnaVersion: brandDna.version, avatarVersion: avatar?.version ?? null },
    };
  },
};
