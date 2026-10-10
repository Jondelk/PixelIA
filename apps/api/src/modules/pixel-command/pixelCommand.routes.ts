import {
  AdjustPixelCommandSchema,
  ConfirmPixelCommandSchema,
  CreatePixelCommandSchema,
  type PixelCommandConfirmResponse,
  type PixelCommandResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  adjustPixelCommand,
  cancelPixelCommand,
  confirmPixelCommand,
  createPixelCommand,
  getPixelCommand,
  overridePixelCommandGuardian,
  type PixelCommandDeps,
} from './pixelCommand.service.js';

/**
 * Módulo pixel-command — /api/workspaces/:workspaceId/pixel/commands, detrás de
 * requireWorkspaceAccess. Personal y Enterprise: qué puede pedir cada uno lo deciden las
 * capacidades de contracts (`pixelIntentAvailable`). Ver docs/PIXEL-COMMAND.md.
 */
export function createPixelCommandRouter(deps: PixelCommandDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/', async (req, res) => {
    const input = CreatePixelCommandSchema.parse(req.body);
    const body: PixelCommandResponse = {
      command: await createPixelCommand(getWorkspace(req), input, deps),
    };
    res.status(201).json(body);
  });

  router.get('/:commandId', async (req, res) => {
    const body: PixelCommandResponse = {
      command: await getPixelCommand(getWorkspace(req), req.params.commandId),
    };
    res.json(body);
  });

  router.post('/:commandId/adjust', async (req, res) => {
    const input = AdjustPixelCommandSchema.parse(req.body);
    const body: PixelCommandResponse = {
      command: await adjustPixelCommand(getWorkspace(req), req.params.commandId, input, deps),
    };
    res.json(body);
  });

  router.post('/:commandId/confirm', async (req, res) => {
    const input = ConfirmPixelCommandSchema.parse(req.body);
    const body: PixelCommandConfirmResponse = await confirmPixelCommand(
      getWorkspace(req),
      req.params.commandId,
      input,
      deps,
    );
    res.json(body);
  });

  router.post('/:commandId/guardian-override', async (req, res) => {
    const body: PixelCommandResponse = {
      command: await overridePixelCommandGuardian(getWorkspace(req), req.params.commandId),
    };
    res.json(body);
  });

  router.post('/:commandId/cancel', async (req, res) => {
    const body: PixelCommandResponse = {
      command: await cancelPixelCommand(getWorkspace(req), req.params.commandId),
    };
    res.json(body);
  });

  return router;
}
