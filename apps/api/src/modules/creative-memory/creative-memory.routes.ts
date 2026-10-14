import {
  CreativeMemoryListQuerySchema,
  RememberCreativeMemorySchema,
  ReplaceCreativeMemorySchema,
  type CreativeMemoryActionResponse,
  type CreativeMemoryListResponse,
  type CreativeMemoryResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  assertCreativeMemory,
  confirmCreativeMemory,
  dismissCreativeMemory,
  forgetCreativeMemory,
  getCreativeMemory,
  listCreativeMemories,
  rememberCreativeMemory,
  replaceCreativeMemory,
  resolveMemoryScope,
} from './creativeMemory.service.js';

/**
 * Módulo creative-memory — /api/workspaces/:workspaceId/creative-memories, detrás de
 * requireWorkspaceAccess (Personal y Enterprise, capacidad `creativeMemory`). Ver
 * docs/CREATIVE-MEMORY.md. Los CreativeDecisionEvent no tienen CRUD: solo los registran los
 * servicios y aquí solo se leen como evidencia resumida de una memoria.
 */
export function createCreativeMemoryRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const query = CreativeMemoryListQuerySchema.parse(req.query);
    const body: CreativeMemoryListResponse = {
      memories: await listCreativeMemories(getWorkspace(req), query),
    };
    res.json(body);
  });

  router.post('/remember', async (req, res) => {
    const workspace = getWorkspace(req);
    assertCreativeMemory(workspace);
    const input = RememberCreativeMemorySchema.parse(req.body);
    const scope = await resolveMemoryScope(workspace, input.scope);
    const { memory, created } = await rememberCreativeMemory(workspace, input.text, scope, {
      sourceEventKey: `creative-memory:remember:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      source: 'memory_page',
    });
    const body: CreativeMemoryActionResponse = { memory };
    res.status(created ? 201 : 200).json(body);
  });

  router.get('/:memoryId', async (req, res) => {
    const body: CreativeMemoryResponse = await getCreativeMemory(
      getWorkspace(req),
      req.params.memoryId,
    );
    res.json(body);
  });

  router.post('/:memoryId/confirm', async (req, res) => {
    const body: CreativeMemoryActionResponse = {
      memory: await confirmCreativeMemory(getWorkspace(req), req.params.memoryId),
    };
    res.json(body);
  });

  router.post('/:memoryId/dismiss', async (req, res) => {
    const body: CreativeMemoryActionResponse = {
      memory: await dismissCreativeMemory(getWorkspace(req), req.params.memoryId),
    };
    res.json(body);
  });

  router.post('/:memoryId/forget', async (req, res) => {
    const body: CreativeMemoryActionResponse = {
      memory: await forgetCreativeMemory(getWorkspace(req), req.params.memoryId),
    };
    res.json(body);
  });

  router.post('/:memoryId/replace', async (req, res) => {
    const { text } = ReplaceCreativeMemorySchema.parse(req.body);
    const body: CreativeMemoryActionResponse = {
      memory: await replaceCreativeMemory(getWorkspace(req), req.params.memoryId, text),
    };
    res.status(201).json(body);
  });

  return router;
}

/** Ruta legacy /api/companies/:companyId/memories: nunca tuvo endpoints (404) y se conserva vacía. */
export const creativeMemoryRouter: Router = Router({ mergeParams: true });
