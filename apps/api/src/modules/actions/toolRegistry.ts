import { workspaceSupportsFeature } from '@pixel/contracts';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type {
  ActionAuthorization,
  AnyCapability,
  PixelTool,
  ToolAvailability,
} from './action.types.js';
import { authorizationFor } from './authorization.policy.js';

/*
 * PixelToolRegistry (Prompt 18): el único catálogo de lo que Pixel PUEDE hacer. Añadir una
 * herramienta (Google Calendar en el Prompt 19) es registrarla: PixelCommand, la autorización, la
 * ejecución y la verificación no cambian. No hay un endpoint para ejecutar herramientas: solo el
 * ejecutor de un plan autorizado llega aquí.
 */

export interface ResolvedCapability {
  tool: PixelTool;
  capability: AnyCapability;
  authorization: ActionAuthorization;
}

export class PixelToolRegistry {
  private readonly tools = new Map<string, PixelTool>();

  /** Registra una herramienta. Nunca una capacidad financiera ni dos con la misma clave. */
  register(tool: PixelTool): this {
    if (this.tools.has(tool.key)) throw new Error(`Herramienta duplicada: ${tool.key}`);
    const keys = new Set<string>();
    for (const capability of tool.capabilities) {
      if (keys.has(capability.key)) {
        throw new Error(`Capacidad duplicada: ${tool.key}.${capability.key}`);
      }
      keys.add(capability.key);
      if (authorizationFor(capability) === 'unsupported') {
        throw new Error(`Capacidad no admitida en esta etapa: ${tool.key}.${capability.key}`);
      }
    }
    this.tools.set(tool.key, tool);
    return this;
  }

  get(toolKey: string): PixelTool | null {
    return this.tools.get(toolKey) ?? null;
  }

  /** Registrada → admite el tipo de workspace y su capacidad → conectada (si es externa). */
  async availability(toolKey: string, workspace: WorkspaceDocument): Promise<ToolAvailability> {
    const tool = this.get(toolKey);
    if (!tool) return 'not_registered';
    if (!tool.contextTypes.includes(workspace.type)) return 'unavailable';
    if (tool.feature && !workspaceSupportsFeature(workspace.type, tool.feature)) {
      return 'unavailable';
    }
    try {
      return await tool.availability({ workspace });
    } catch {
      // Comprobar la conexión falló (base o proveedor): no disponible, nunca «disponible».
      return 'unavailable';
    }
  }

  /** Herramientas que este workspace puede usar ahora mismo. */
  async listAvailable(workspace: WorkspaceDocument): Promise<PixelTool[]> {
    const tools = [...this.tools.values()];
    const states = await Promise.all(tools.map((tool) => this.availability(tool.key, workspace)));
    return tools.filter((_, index) => states[index] === 'available');
  }

  /** La capacidad exacta, con la autorización que exige; null si no existe o no está disponible. */
  async resolve(
    toolKey: string,
    capabilityKey: string,
    workspace: WorkspaceDocument,
  ): Promise<ResolvedCapability | null> {
    const tool = this.get(toolKey);
    if (!tool || (await this.availability(toolKey, workspace)) !== 'available') return null;
    const capability = tool.capabilities.find((candidate) => candidate.key === capabilityKey);
    if (!capability) return null;
    return { tool, capability, authorization: authorizationFor(capability) };
  }
}
