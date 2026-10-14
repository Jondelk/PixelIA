import type { PixelExternalService } from '@pixel/contracts';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { authorizationFor } from './authorization.policy.js';
import type { PixelToolRegistry } from './toolRegistry.js';

/*
 * Lo que Pixel ENTIENDE pero quizá no PUEDE hacer (Prompt 18). Cada servicio externo reconocido
 * apunta a la herramienta que lo haría; la respuesta depende de lo que diga el registro, así que
 * registrar `google.calendar` en el Prompt 19 cambia la respuesta sin tocar PixelCommand.
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
}

const TARGETS: Record<PixelExternalService, ExternalTarget> = {
  google_calendar: {
    toolKey: 'google.calendar',
    capabilityKey: 'create_event',
    where: 'tu Google Calendar',
    instead: 'Si quieres, lo apunto como tarea en Pixel con su fecha.',
  },
  calendar: {
    toolKey: 'calendar',
    capabilityKey: 'create_event',
    where: 'tu calendario',
    instead: 'Si quieres, lo apunto como tarea en Pixel con su fecha.',
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
  availability: ReturnType<PixelToolRegistry['availability']> | 'unsupported';
  reply: string;
}

/** Respuesta honesta a una acción externa. Nunca dice que se hizo. */
export function answerExternalRequest(
  service: PixelExternalService | null,
  registry: PixelToolRegistry,
  workspace: WorkspaceDocument,
): ExternalRequestAnswer {
  if (!service) {
    return {
      availability: 'not_registered',
      reply:
        'Eso necesita una herramienta externa que Pixel todavía no tiene. Puedo ayudarte a prepararlo para que lo hagas tú.',
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
    };
  }
  const availability = registry.availability(target.toolKey, workspace);
  switch (availability) {
    case 'requires_auth':
    case 'disconnected':
      return {
        availability,
        reply: `Para hacerlo necesito que conectes ${target.where}. ${target.instead}`,
      };
    case 'available':
      // La herramienta existe, pero esta solicitud aún no tiene un planificador que la use.
      return {
        availability,
        reply: `Todavía no puedo preparar esa acción en ${target.where}. ${target.instead}`,
      };
    default:
      return {
        availability,
        reply: `Puedo ayudarte a preparar eso, pero todavía no tengo acceso a ${target.where}. ${target.instead}`,
      };
  }
}
