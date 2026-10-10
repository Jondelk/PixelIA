import {
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type CreatePixelCommandInput,
  type PixelCommand,
  type PixelCommandConfirmResponse,
  type PixelCommandSource,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceApiBase } from '../../lib/apiPaths';
import { browserTzOffset } from '../../lib/query';

/**
 * PixelCommand: /api/workspaces/:workspaceId/pixel/commands. El texto puede venir del teclado o, en
 * el futuro, de una transcripción de voz (`source: 'voice'`): la API es la misma.
 */

const commandsPath = (workspaceId: string) => `${workspaceApiBase(workspaceId)}/pixel/commands`;
const commandPath = (workspaceId: string, commandId: string) =>
  `${commandsPath(workspaceId)}/${encodeURIComponent(commandId)}`;

export async function sendPixelCommand(
  workspaceId: string,
  input: Omit<CreatePixelCommandInput, 'tzOffset'>,
): Promise<PixelCommand> {
  const { command } = await apiRequest(commandsPath(workspaceId), PixelCommandResponseSchema, {
    method: 'POST',
    body: { ...input, tzOffset: browserTzOffset() },
  });
  return command;
}

export async function adjustPixelCommand(
  workspaceId: string,
  commandId: string,
  message: string,
  source: PixelCommandSource = 'text',
): Promise<PixelCommand> {
  const { command } = await apiRequest(
    `${commandPath(workspaceId, commandId)}/adjust`,
    PixelCommandResponseSchema,
    { method: 'POST', body: { message, source } },
  );
  return command;
}

export function confirmPixelCommand(
  workspaceId: string,
  commandId: string,
  revision: number,
): Promise<PixelCommandConfirmResponse> {
  return apiRequest(
    `${commandPath(workspaceId, commandId)}/confirm`,
    PixelCommandConfirmResponseSchema,
    {
      method: 'POST',
      body: { revision },
    },
  );
}

export async function cancelPixelCommand(
  workspaceId: string,
  commandId: string,
): Promise<PixelCommand> {
  const { command } = await apiRequest(
    `${commandPath(workspaceId, commandId)}/cancel`,
    PixelCommandResponseSchema,
    { method: 'POST' },
  );
  return command;
}
