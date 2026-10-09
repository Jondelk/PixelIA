import { DEFAULT_TIMEZONE } from '@pixel/contracts';
import { AvatarProfileModel, toAvatarProfileDTO } from '../../avatars/avatarProfile.model.js';
import { CreativeMemoryModel } from '../../creative-memory/creativeMemory.model.js';
import { loadPersonalDna } from '../../personal/personal.service.js';
import { currentBriefForContext } from '../../daily-director/dailyBrief.current.js';
import { toPersonalDnaDTO } from '../../personal/personalDna.model.js';
import { buildPersonalPixelContext } from '../personalPixelContext.builder.js';
import { notConfigured, type ContextBuilder } from './contextBuilder.js';

export const PERSONAL_CONTEXT_NOT_CONFIGURED =
  'Pixel aún no te conoce: completa tu onboarding personal para conversar con tu Pixel Personal.';

/** Memorias activas más recientes que entran al contexto. */
const MEMORY_LIMIT = 10;

/**
 * Personal: Workspace → PersonalProfile → PersonalDNA (+ AvatarProfile y CreativeMemory del
 * workspace). Todo se filtra por el workspaceId del workspace autorizado: nunca toca Company ni
 * BrandDNA, ni datos de otro workspace (aunque sea del mismo dueño). Sin PersonalDNA responde
 * `personal_context_not_configured` (el chat devuelve 409 y la web lleva al onboarding).
 */
export const personalContextBuilder: ContextBuilder = {
  type: 'personal',

  async build({ workspace, history, userMessage, historyLimit, defaultTimezone }) {
    if (workspace.type !== 'personal') {
      return notConfigured('personal_context_not_configured', PERSONAL_CONTEXT_NOT_CONFIGURED);
    }
    const { profile, personalDna: dnaDoc } = await loadPersonalDna(workspace);
    if (!profile || !dnaDoc) {
      return notConfigured('personal_context_not_configured', PERSONAL_CONTEXT_NOT_CONFIGURED);
    }
    const personalDna = toPersonalDnaDTO(dnaDoc);

    const [avatarDoc, memories, daily] = await Promise.all([
      profile.avatarVersion
        ? AvatarProfileModel.findOne({ workspaceId: workspace._id, version: profile.avatarVersion })
        : null,
      CreativeMemoryModel.find({ workspaceId: workspace._id, active: true })
        .sort({ createdAt: -1 })
        .limit(MEMORY_LIMIT)
        .select({ content: 1 })
        .lean(),
      // Solo la dirección vigente de HOY (nunca el historial), marcada si quedó desactualizada.
      currentBriefForContext(workspace, defaultTimezone ?? DEFAULT_TIMEZONE),
    ]);
    const avatar = avatarDoc ? toAvatarProfileDTO(avatarDoc) : null;

    const context = buildPersonalPixelContext({
      personalDna,
      avatar,
      memories: memories.map((memory) => memory.content),
      dailyBrief: daily
        ? {
            localDate: daily.brief.localDate,
            stale: daily.stale,
            summary: daily.brief.summary,
            priorities: daily.brief.priorities.map((priority) => ({
              title: priority.title,
              rationale: priority.rationale,
              urgency: priority.urgency,
            })),
            warnings: daily.brief.warnings.map((warning) => warning.message),
            content: daily.brief.contentSuggestion?.title ?? null,
            focus: daily.brief.focusBlocks.map((block) => block.title),
          }
        : null,
      history,
      userMessage,
      limits: { historyMessages: historyLimit },
    });

    return {
      status: 'ready',
      context,
      companyId: null,
      meta: {
        brandDnaVersion: null,
        personalDnaVersion: personalDna.version,
        avatarVersion: avatar?.version ?? null,
      },
    };
  },
};
