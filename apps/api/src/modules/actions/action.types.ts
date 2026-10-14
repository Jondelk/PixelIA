import type { PixelResourceKind, WorkspaceFeature, WorkspaceType } from '@pixel/contracts';
import type { ZodType } from 'zod';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';

/*
 * Pixel Action Foundation (Prompt 18, docs/PIXEL-ACTIONS.md y docs/PIXEL-TOOLS.md).
 *
 * «Tools extend Pixel. They do not replace PixelCommand.» Una herramienta es un ADAPTADOR
 * controlado sobre servicios que ya existen (o, en el futuro, sobre una API externa con sus
 * credenciales resueltas en el servidor). No es function calling de ningún proveedor de IA: el
 * backend decide qué herramientas y capacidades existen, qué entrada es válida, quién puede actuar y
 * qué se ejecuta. La IA, como mucho, propone.
 */

/** Qué hace una capacidad sobre el mundo. */
export type ActionEffect = 'read' | 'create' | 'update' | 'delete';
/** Dónde: dentro de Pixel (Mongo) o en un servicio externo. */
export type ActionTarget = 'internal' | 'external';
/**
 * Autorización que exige (la calcula ActionAuthorizationPolicy, nunca la IA):
 * - none: no necesita confirmación propia (lecturas);
 * - confirm: la confirmación única del plan («Organizar»);
 * - elevated: una confirmación reforzada que V1 aún no ofrece (no se ejecuta);
 * - unsupported: nunca en esta etapa (compras, pagos, transferencias).
 */
export type ActionAuthorization = 'none' | 'confirm' | 'elevated' | 'unsupported';

/**
 * Estado de una herramienta para un workspace. Registrada no es disponible, y disponible no es
 * conectada: una herramienta externa futura puede estar `requires_auth` hasta que el usuario la
 * conecte. Pixel nunca finge una conexión.
 */
export type ToolAvailability =
  'available' | 'requires_auth' | 'disconnected' | 'unavailable' | 'not_registered';

/** Códigos normalizados de un resultado (docs/PIXEL-ACTIONS.md §Errores). Nunca un stack trace. */
export type ActionErrorCode =
  | 'tool_unavailable'
  | 'capability_unavailable'
  | 'unauthorized'
  | 'invalid_input'
  | 'resource_not_found'
  | 'resource_conflict'
  | 'execution_failed'
  | 'verification_failed'
  | 'dependency_failed'
  | 'execution_interrupted';

/** Referencia a un recurso de Pixel, siempre del workspace de la ejecución. */
export interface ControlledResourceRef {
  kind: PixelResourceKind;
  id: string;
  label: string;
}

/**
 * Lo que una herramienta recibe para actuar. El workspace llega AUTORIZADO por la ruta (dueño =
 * usuario de la sesión): ninguna entrada de la IA ni del cliente puede cambiarlo.
 */
export interface ToolExecutionContext {
  workspace: WorkspaceDocument;
  contextType: WorkspaceType;
  /** Quien autorizó (el usuario autenticado). */
  actorUserId: string;
  commandId: string;
  executionId: string;
  /** Estable por comando, revisión y acción: `${commandId}:${revision}:${actionId}`. */
  idempotencyKey: string;
}

/** Resultado de una herramienta (antes de verificar). Sin secretos ni payloads completos. */
export interface ToolExecutionResult<O = unknown> {
  status: 'success' | 'failed';
  summary: string;
  resourceRefs: ControlledResourceRef[];
  output?: O;
  errorCode?: ActionErrorCode;
}

export interface ToolCapabilityDefinition<I = unknown, O = unknown> {
  key: string;
  description: string;
  inputSchema: ZodType<I>;
  outputSchema?: ZodType<O>;
  effect: ActionEffect;
  target: ActionTarget;
  /** Recurso que crea, modifica o lee. */
  resourceKind: PixelResourceKind;
  /** Cambia información importante (fechas, estado, responsables…): exige confirmación. */
  significant?: boolean;
  reversible?: boolean;
  /** Mueve dinero: compras, pagos, transferencias, gasto en anuncios. Nunca se ejecuta en V1. */
  financial?: boolean;
  /** Toca datos personales o sensibles: no se registra su entrada en los logs. */
  sensitive?: boolean;
  /**
   * Campos de la entrada que pueden venir del resultado de una acción anterior (p. ej. el proyecto
   * recién creado para sus tareas): `{ projectId: 'project' }`. Nunca por interpolación de texto.
   */
  refFields?: Record<string, PixelResourceKind>;
  execute(input: I, ctx: ToolExecutionContext): Promise<ToolExecutionResult<O>>;
  /**
   * Comprueba que el efecto EXISTE (relee con `{ _id, workspaceId }`). Sin verificación positiva,
   * la acción no cuenta como hecha aunque el servicio haya respondido bien.
   */
  verify(result: ToolExecutionResult<O>, input: I, ctx: ToolExecutionContext): Promise<boolean>;
}

/** Capacidad sin tipos concretos, como la guarda el registro. */
export type AnyCapability = ToolCapabilityDefinition<unknown, unknown>;

/**
 * Tipa una capacidad y la guarda sin tipos. Es seguro porque el ejecutor SIEMPRE valida la entrada
 * con `inputSchema` antes de llamar a `execute`/`verify`.
 */
export function defineCapability<I, O>(definition: ToolCapabilityDefinition<I, O>): AnyCapability {
  return definition as unknown as AnyCapability;
}

export interface PixelTool {
  /** Clave estable, no acoplada a rutas HTTP: `workspace.projects`, `google.calendar`… */
  key: string;
  name: string;
  description: string;
  contextTypes: WorkspaceType[];
  /** Capacidad de contracts que exige en el workspace (además del tipo). */
  feature?: WorkspaceFeature;
  capabilities: AnyCapability[];
  /** Conexión del workspace (herramientas externas). Las internas siempre están disponibles. */
  availability(ctx: { workspace: WorkspaceDocument }): ToolAvailability;
}
