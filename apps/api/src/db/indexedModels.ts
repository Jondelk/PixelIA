import { AvatarProfileModel } from '../modules/avatars/avatarProfile.model.js';
import { CompanyModel } from '../modules/companies/company.model.js';
import { ConversationModel } from '../modules/conversations/conversation.model.js';
import { MessageModel } from '../modules/conversations/message.model.js';
import { CreativeMemoryModel } from '../modules/creative-memory/creativeMemory.model.js';
import { ProjectModel } from '../modules/operations/project.model.js';
import { TaskModel } from '../modules/operations/task.model.js';
import { WorkspaceModel } from '../modules/workspaces/workspace.model.js';

/**
 * Modelos cuyos índices sincroniza de forma EXPLÍCITA `npm run migrate:workspaces`
 * (`createIndexes`, o `syncIndexes` con `--sync-indexes`). Son los índices de los que depende la
 * integridad (únicos), no los de rendimiento: los de migración (`migratedFromCompanyId`) y, desde
 * el Prompt 18, los de idempotencia de las acciones de Pixel en Project y Task
 * (`workspace_pixel_action_key_unique`).
 */
export const EXPLICIT_INDEX_MODELS = [
  WorkspaceModel,
  CompanyModel,
  AvatarProfileModel,
  ConversationModel,
  MessageModel,
  CreativeMemoryModel,
  ProjectModel,
  TaskModel,
] as const;
