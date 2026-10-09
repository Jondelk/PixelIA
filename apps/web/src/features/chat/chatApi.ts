import {
  ConversationListResponseSchema,
  ConversationMessagesResponseSchema,
  ConversationResponseSchema,
  SendMessageResponseSchema,
  type Conversation,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

/** `apiBase`: companyApiBase(companyId) o workspaceApiBase(workspaceId) (lib/apiPaths). */
const conversations = (apiBase: string) => `${apiBase}/conversations`;
const messages = (apiBase: string, conversationId: string) =>
  `${conversations(apiBase)}/${encodeURIComponent(conversationId)}/messages`;

export async function listConversations(
  apiBase: string,
  signal?: AbortSignal,
): Promise<Conversation[]> {
  return (await apiRequest(conversations(apiBase), ConversationListResponseSchema, { signal }))
    .conversations;
}

export async function createConversation(apiBase: string): Promise<Conversation> {
  return (await apiRequest(conversations(apiBase), ConversationResponseSchema, { method: 'POST' }))
    .conversation;
}

export function getMessages(apiBase: string, conversationId: string, signal?: AbortSignal) {
  return apiRequest(messages(apiBase, conversationId), ConversationMessagesResponseSchema, {
    signal,
  });
}

export function sendMessage(apiBase: string, conversationId: string, content: string) {
  return apiRequest(messages(apiBase, conversationId), SendMessageResponseSchema, {
    method: 'POST',
    body: { content },
  });
}
