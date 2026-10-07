import { SendMessageInputSchema, type SendMessageResponse } from '@pixel/contracts';
import { Router } from 'express';
import { getAuth } from '../../middleware/requireAuth.js';
import { getCompany } from '../../middleware/requireCompanyAccess.js';
import {
  createConversation,
  getConversationMessages,
  listConversations,
  sendMessage,
  type ChatDeps,
} from './chat.service.js';

/**
 * Módulo conversations — /api/companies/:companyId/conversations.
 * Montado detrás de requireAuth + requireCompanyAccess: `req.company` ya está autorizada.
 */
export function createConversationsRouter(deps: ChatDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    res.json({ conversations: await listConversations(getCompany(req), getAuth(req).userId) });
  });

  router.post('/', async (req, res) => {
    res
      .status(201)
      .json({ conversation: await createConversation(getCompany(req), getAuth(req).userId) });
  });

  router.get('/:conversationId/messages', async (req, res) => {
    res.json(
      await getConversationMessages(
        getCompany(req),
        getAuth(req).userId,
        String(req.params.conversationId),
      ),
    );
  });

  /** Envía un mensaje y devuelve la respuesta de Pixel. */
  router.post('/:conversationId/messages', async (req, res) => {
    const { content } = SendMessageInputSchema.parse(req.body);
    const body: SendMessageResponse = await sendMessage(
      getCompany(req),
      getAuth(req).userId,
      String(req.params.conversationId),
      content,
      deps,
    );
    res.status(201).json(body);
  });

  return router;
}
