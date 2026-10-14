import type { AvatarProfile, Conversation, Message } from '@pixel/contracts';
import { getAvatar } from '../pixel/avatarApi';
import { getMessages, listConversations } from './chatApi';

export interface ChatData {
  avatar: AvatarProfile | null;
  conversations: Conversation[];
  messages: Message[];
}

/** Avatar, conversaciones y mensajes de la más reciente. */
export async function loadChatData(apiBase: string, signal: AbortSignal): Promise<ChatData> {
  const [avatar, conversations] = await Promise.all([
    getAvatar(apiBase, signal).then((res) => res.avatar),
    listConversations(apiBase, signal),
  ]);
  const latest = conversations[0];
  const messages = latest ? (await getMessages(apiBase, latest.id, signal)).messages : [];
  return { avatar, conversations, messages };
}
