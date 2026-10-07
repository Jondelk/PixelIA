import {
  ConversationListResponseSchema,
  ConversationMessagesResponseSchema,
  ConversationResponseSchema,
  SendMessageResponseSchema,
  type Conversation,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';

const base = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/conversations`;

export async function listConversations(
  companyId: string,
  signal?: AbortSignal,
): Promise<Conversation[]> {
  return (await apiRequest(base(companyId), ConversationListResponseSchema, { signal }))
    .conversations;
}

export async function createConversation(companyId: string): Promise<Conversation> {
  return (await apiRequest(base(companyId), ConversationResponseSchema, { method: 'POST' }))
    .conversation;
}

export function getMessages(companyId: string, conversationId: string, signal?: AbortSignal) {
  return apiRequest(
    `${base(companyId)}/${encodeURIComponent(conversationId)}/messages`,
    ConversationMessagesResponseSchema,
    {
      signal,
    },
  );
}

export function sendMessage(companyId: string, conversationId: string, content: string) {
  return apiRequest(
    `${base(companyId)}/${encodeURIComponent(conversationId)}/messages`,
    SendMessageResponseSchema,
    {
      method: 'POST',
      body: { content },
    },
  );
}
