import type { CalendarConnectionStatus, PixelExternalService } from '@pixel/contracts';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { ToolAvailability } from './action.types.js';
import { authorizationFor } from './authorization.policy.js';
import type { PixelToolRegistry } from './toolRegistry.js';

/*
 * Lo que Pixel ENTIENDE pero quizá no PUEDE hacer (Prompt 18; Prompt 19 conecta Google Calendar).
 * Cada servicio externo reconocido apunta a la herramienta que lo haría; la respuesta depende de lo
 * que diga el registro (no registrada, sin configurar, sin conectar, a reconectar, caída), así que
 * registrar o conectar una herramienta cambia la respuesta sin tocar PixelCommand.
 *
 * «Pixel must never claim an external or persistent action was completed unless an execution
 * result confirms it.» Aquí no se ejecuta nada: no hay plan, ni snapshot, ni ejecución.
 */

interface ExternalTarget {
  toolKey: string;
  capabilityKey: string;
  /** Cómo se nombra en la respuesta. */
  where: string;
  /** Lo que Pixel sí puede hacer mientras tanto. */
  instead: string;
  financial?: boolean;
  /** Se puede conectar desde Pixel (muestra «Conectar…»). */
  connectable?: 'google_calendar';
}

const TARGETS: Record<PixelExternalService, ExternalTarget> = {
  google_calendar: {
    toolKey: 'google.calendar',
    capabilityKey: 'create_event',
    where: 'tu Google Calendar',
    instead: 'Si quieres, lo apunto como tarea en Pixel con su fecha.',
    connectable: 'google_calendar',
  },
  calendar: {
    toolKey: 'google.calendar',
    capabilityKey: 'create_event',
    where: 'tu calendario',
    instead: 'Si quieres, lo apunto como tarea en Pixel con su fecha.',
    connectable: 'google_calendar',
  },
  email: {
    toolKey: 'email',
    capabilityKey: 'send_email',
    where: 'tu correo',
    instead: 'Puedo ayudarte a redactarlo para que lo envíes tú.',
  },
  messaging: {
    toolKey: 'messaging',
    capabilityKey: 'send_message',
    where: 'tus mensajes',
    instead: 'Puedo ayudarte a redactar el mensaje para que lo envíes tú.',
  },
  payment: {
    toolKey: 'payments',
    capabilityKey: 'pay',
    where: 'pagos',
    instead: 'Puedo ayudarte a preparar la información para que lo hagas tú.',
    financial: true,
  },
};

export interface ExternalRequestAnswer {
  /** Lo que el registro dice de esa herramienta para este workspace. */
  availability: ToolAvailability | 'unsupported';
  reply: string;
  /** Prompt 19: la web ofrece «Conectar Google Calendar» (nunca con una URL ni un token). */
  connect: { provider: 'google_calendar'; status: CalendarConnectionStatus } | null;
}

/** El servicio que nombró la frase apunta a esta herramienta (o a ninguna). */
export function externalToolKey(service: PixelExternalService | null): string | null {
  return service ? TARGETS[service].toolKey : null;
}

/** Respuesta honesta a una acción externa que Pixel no va a ejecutar ahora. Nunca dice que se hizo. */
export async function answerExternalRequest(
  service: PixelExternalService | null,
  registry: PixelToolRegistry,
  workspace: WorkspaceDocument,
): Promise<ExternalRequestAnswer> {
  if (!service) {
    return {
      availability: 'not_registered',
      reply:
        'Eso necesita una herramienta externa que Pixel todavía no tiene. Puedo ayudarte a prepararlo para que lo hagas tú.',
      connect: null,
    };
  }
  const target = TARGETS[service];
  // La política decide (financiero → unsupported), no esta tabla.
  if (
    authorizationFor({ effect: 'create', target: 'external', financial: target.financial }) ===
    'unsupported'
  ) {
    return {
      availability: 'unsupported',
      reply: `No hago compras, pagos ni transferencias: Pixel no mueve dinero. ${target.instead}`,
      connect: null,
    };
  }
  const availability = await registry.availability(target.toolKey, workspace);
  const connect = (status: CalendarConnectionStatus) =>
    target.connectable ? { provider: target.connectable, status } : null;
  switch (availability) {
    case 'unconfigured':
      return {
        availability,
        reply: `Google Calendar todavía no está configurado en esta instalación de Pixel. ${target.instead}`,
        connect: connect('unconfigured'),
      };
    case 'requires_auth':
    case 'disconnected':
      return {
        availability,
        reply: `Para consultar tu disponibilidad necesito conectar ${target.where}. ${target.instead}`,
        connect: connect('requires_auth'),
      };
    case 'requires_reauth':
      return {
        availability,
        reply: `Necesito volver a conectar ${target.where}: la conexión anterior dejó de ser válida.`,
        connect: connect('requires_reauth'),
      };
    case 'available':
      // Conectada, pero esta solicitud no tiene un planificador que la use.
      return {
        availability,
        reply: `Todavía no puedo preparar esa acción en ${target.where}. ${target.instead}`,
        connect: null,
      };
    default:
      return {
        availability,
        reply: `Puedo ayudarte a preparar eso, pero todavía no tengo acceso a ${target.where}. ${target.instead}`,
        connect: null,
      };
  }
}
