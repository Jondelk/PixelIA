import type { AvatarProfile, Conversation, Message } from '@pixel/contracts';
import { getAvatar, getAvatarModel, modelFileUrl } from '../pixel/avatarApi';
import { getMessages, listConversations } from './chatApi';

export interface ChatData {
  avatar: AvatarProfile | null;
  /** Modelo 3D del personaje (si ya se esculpió). */
  modelUrl: string | null;
  conversations: Conversation[];
  messages: Message[];
}

/** Avatar, conversaciones y mensajes de la más reciente. */
export async function loadChatData(apiBase: string, signal: AbortSignal): Promise<ChatData> {
  const [avatar, conversations, model] = await Promise.all([
    getAvatar(apiBase, signal).then((res) => res.avatar),
    listConversations(apiBase, signal),
    // El chat funciona igual sin modelo 3D: un fallo aquí no bloquea la conversación.
    getAvatarModel(apiBase, signal).catch(() => null),
  ]);
  const latest = conversations[0];
  const messages = latest ? (await getMessages(apiBase, latest.id, signal)).messages : [];
  const glb = model?.model?.status === 'ready' ? model.model.files.glb : null;
  return { avatar, modelUrl: glb ? modelFileUrl(glb) : null, conversations, messages };
}
