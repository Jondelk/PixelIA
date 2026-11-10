import type { CalendarDeps } from '../../calendar/calendarConnection.service.js';
import { PixelToolRegistry } from '../toolRegistry.js';
import { createGoogleCalendarTool } from './googleCalendar.tool.js';
import { workspaceProjectsTool } from './workspaceProjects.tool.js';
import { workspaceTasksTool } from './workspaceTasks.tool.js';

/**
 * Herramientas de producción: las internas (Prompt 18) y Google Calendar (Prompt 19, solo
 * Personal). Sin `calendar`, Google Calendar no se registra. Las demás externas (correo…) siguen sin
 * existir: Pixel dice que no tiene acceso.
 */
export function createDefaultToolRegistry(calendar?: CalendarDeps): PixelToolRegistry {
  const registry = new PixelToolRegistry()
    .register(workspaceProjectsTool)
    .register(workspaceTasksTool);
  if (calendar) registry.register(createGoogleCalendarTool(calendar));
  return registry;
}

export { workspaceProjectsTool, workspaceTasksTool };
