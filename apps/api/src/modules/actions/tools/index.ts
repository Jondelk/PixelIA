import { PixelToolRegistry } from '../toolRegistry.js';
import { workspaceProjectsTool } from './workspaceProjects.tool.js';
import { workspaceTasksTool } from './workspaceTasks.tool.js';

/**
 * Herramientas de producción (Prompt 18): solo internas. Las externas (calendario, correo…) se
 * registrarán aquí cuando existan; hasta entonces Pixel dice que no tiene acceso.
 */
export function createDefaultToolRegistry(): PixelToolRegistry {
  return new PixelToolRegistry().register(workspaceProjectsTool).register(workspaceTasksTool);
}

export { workspaceProjectsTool, workspaceTasksTool };
