import { CalendarConnectionStatusSchema, WeekPlanViewSchema } from './calendar.js';
import { z } from 'zod';
import { CampaignTypeSchema } from './campaign.js';
import { workspaceSupportsFeature, type WorkspaceFeature } from './capabilities.js';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { ContentFormatSchema, ContentPlatformSchema } from './contentItem.js';
import { GuardianPreflightSummarySchema } from './guardian.js';
import type { WorkspaceType } from './workspace.js';

/*
 * PixelCommand (Prompt 14.1, docs/PIXEL-COMMAND.md): una solicitud natural del usuario ("Necesito
 * lanzar TINTO 500 g la próxima semana") que Pixel interpreta, completa con lo que ya sabe del
 * workspace, convierte en una propuesta y, solo tras una confirmación, ejecuta con los servicios
 * existentes (Campaign Manager, Content Planner, Operations). No es una línea de comandos ni otro
 * chat: es la entrada principal de Pixel. El texto puede venir del teclado o, en el futuro, de una
 * transcripción de voz (`source`): el resto del flujo es idéntico.
 */

export const PIXEL_COMMAND_INTENTS = [
  'create_campaign',
  'plan_content',
  'create_content',
  'organize_project',
  'create_tasks',
  'creative_advice',
  'work_status',
  /** Prompt 16: recordar, olvidar o mostrar lo que Pixel ha aprendido (Creative Memory). */
  'manage_memory',
  /**
   * Prompt 18: una acción en un servicio externo (calendario, correo, mensajería, pagos). Pixel la
   * entiende y responde con honestidad si no tiene esa capacidad: nunca finge que la hizo.
   */
  'external_action',
  /** Prompt 19 (solo Personal): organizar la semana con Google Calendar. */
  'plan_week',
  /** Prompt 19 (solo Personal): mover un bloque que Pixel creó («no pude estudiar hoy»). */
  'replan_block',
  'unknown',
] as const;
export const PixelCommandIntentSchema = z.enum(PIXEL_COMMAND_INTENTS);
export type PixelCommandIntent = z.infer<typeof PixelCommandIntentSchema>;

/** Capacidad de contracts que exige cada intención (null = solo lee o responde). */
const INTENT_FEATURES: Record<PixelCommandIntent, WorkspaceFeature | null> = {
  create_campaign: 'campaigns',
  plan_content: 'contentPlanner',
  create_content: 'content',
  organize_project: 'projects',
  create_tasks: 'tasks',
  creative_advice: null,
  work_status: null,
  manage_memory: 'creativeMemory',
  external_action: null,
  plan_week: 'calendar',
  replan_block: 'calendar',
  unknown: null,
};

/** ¿Puede este tipo de workspace atender la intención? Deriva de las capacidades (nunca de if/else). */
export function pixelIntentAvailable(type: WorkspaceType, intent: PixelCommandIntent): boolean {
  const feature = INTENT_FEATURES[intent];
  return feature === null || workspaceSupportsFeature(type, feature);
}

export function availablePixelIntents(type: WorkspaceType): PixelCommandIntent[] {
  return PIXEL_COMMAND_INTENTS.filter((intent) => pixelIntentAvailable(type, intent));
}

export const PIXEL_TIMEFRAMES = [
  'today',
  'this_week',
  'next_week',
  'next_two_weeks',
  'this_month',
  'next_month',
] as const;
export const PixelTimeframeSchema = z.enum(PIXEL_TIMEFRAMES);
export type PixelTimeframe = z.infer<typeof PixelTimeframeSchema>;

const entityText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);

/**
 * Servicios externos que Pixel sabe RECONOCER (Prompt 18). Reconocer no es poder: si no hay una
 * herramienta conectada, Pixel lo dice. `payment` (compras, pagos, transferencias) nunca se ejecuta.
 */
export const PIXEL_EXTERNAL_SERVICES = [
  'google_calendar',
  'calendar',
  'email',
  'messaging',
  'payment',
] as const;
export type PixelExternalService = (typeof PIXEL_EXTERNAL_SERVICES)[number];

/**
 * Lo que el usuario DIJO (nunca ids ni lo que ya vive en el ADN: tono, colores, audiencia…). Las
 * pistas de campaña o proyecto son texto: el backend las resuelve contra el workspace activo.
 */
export const PixelCommandEntitiesSchema = z.object({
  productOrService: entityText(200),
  /** Objetivo o tema de una campaña, en palabras del usuario. */
  objective: entityText(500),
  campaignType: CampaignTypeSchema.nullable().default(null),
  timeframe: PixelTimeframeSchema.nullable().default(null),
  platforms: z.array(ContentPlatformSchema).max(9).default([]),
  excludedPlatforms: z.array(ContentPlatformSchema).max(9).default([]),
  formats: z.array(ContentFormatSchema).max(11).default([]),
  excludedFormats: z.array(ContentFormatSchema).max(11).default([]),
  pieceCount: z.number().int().min(1).max(30).nullable().default(null),
  /** Nombre de una campaña mencionada ("la campaña de Navidad"). */
  campaignHint: entityText(120),
  /** Nombre de un proyecto mencionado. */
  projectHint: entityText(120),
  /** De qué trata el contenido ("sobre el origen"). */
  topic: entityText(200),
  taskTitles: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  /** La solicitud de campaña incluye también contenido (publicar, Reels, "moverla por Instagram"…). */
  includeContent: z.boolean().default(false),
  /** manage_memory (Prompt 16): qué hacer con la memoria creativa. */
  memoryAction: z.enum(['remember', 'forget', 'show']).nullable().default(null),
  /** Lo que hay que recordar u olvidar, en palabras del usuario. */
  memoryText: entityText(500),
  /** Alcance que el usuario dijo: "para TINTO en general" o "solo para esta campaña". */
  memoryScopeHint: z.enum(['workspace', 'campaign']).nullable().default(null),
  /** external_action (Prompt 18): el servicio externo que el usuario nombró. */
  externalService: z.enum(PIXEL_EXTERNAL_SERVICES).nullable().default(null),
});
export type PixelCommandEntities = z.infer<typeof PixelCommandEntitiesSchema>;

/** Salida estructurada del intérprete (IA o reglas). La valida y la sanea el backend. */
export const GeneratedPixelInterpretationSchema = z.object({
  intent: PixelCommandIntentSchema,
  confidence: z.number().min(0).max(1),
  entities: PixelCommandEntitiesSchema,
  missingRequiredInformation: z.array(z.string().max(60)).max(5).default([]),
});
export type GeneratedPixelInterpretation = z.infer<typeof GeneratedPixelInterpretationSchema>;

export const PIXEL_COMMAND_STATUSES = [
  'needs_information',
  'proposed',
  'answered',
  'executing',
  'completed',
  'partial',
  'failed',
  'cancelled',
] as const;
export const PixelCommandStatusSchema = z.enum(PIXEL_COMMAND_STATUSES);
export type PixelCommandStatus = z.infer<typeof PixelCommandStatusSchema>;

export const PixelActionStepTypeSchema = z.enum([
  'generate_campaign',
  'generate_content_plan',
  'create_project',
  'create_tasks',
  'create_content_item',
  'remember_memory',
  'forget_memory',
  /** Prompt 19: guardar los bloques del plan en Google Calendar (una acción por bloque). */
  'schedule_blocks',
  /** Prompt 19: mover un bloque de Pixel en Google Calendar. */
  'move_block',
]);
export type PixelActionStepType = z.infer<typeof PixelActionStepTypeSchema>;

export const PixelResourceKindSchema = z.enum([
  'campaign',
  'content_plan',
  'project',
  'task',
  'content_item',
  'creative_memory',
  /** Prompt 19: un evento de Google Calendar creado o movido por Pixel. */
  'calendar_event',
]);
export type PixelResourceKind = z.infer<typeof PixelResourceKindSchema>;

export const PixelCreatedResourceSchema = z.object({
  kind: PixelResourceKindSchema,
  /** Id de Pixel, o referencia controlada de un recurso externo (nunca un token). */
  id: z.string().min(1).max(200),
  label: z.string(),
});
export type PixelCreatedResource = z.infer<typeof PixelCreatedResourceSchema>;

/** Un paso del plan, en lenguaje humano. Sus parámetros internos no salen de la API. */
export const PixelActionStepSchema = z.object({
  id: z.string(),
  type: PixelActionStepTypeSchema,
  title: z.string(),
  status: z.enum(['pending', 'done', 'failed']),
  resources: z.array(PixelCreatedResourceSchema),
  error: z.string().nullable(),
});
export type PixelActionStep = z.infer<typeof PixelActionStepSchema>;

/** Estado de UNA acción del plan (Prompt 18). `success` solo con el efecto VERIFICADO. */
export const PixelPlanActionStatusSchema = z.enum(['pending', 'success', 'failed', 'skipped']);
export type PixelPlanActionStatus = z.infer<typeof PixelPlanActionStatusSchema>;

/**
 * Una acción concreta de la propuesta, en lenguaje humano («Crear la tarea «Repasar límites»»).
 * Nunca lleva nombres de herramientas, capacidades, ids internos ni la entrada de la acción: eso
 * vive solo en la API (docs/PIXEL-ACTIONS.md).
 */
export const PixelPlanActionSchema = z.object({
  id: z.string(),
  stepId: z.string(),
  kind: PixelResourceKindSchema,
  effect: z.enum(['create', 'update', 'delete']),
  /** Lo que Pixel hará, en imperativo humano. */
  title: z.string(),
  /** El objeto afectado («Repasar límites»), para los resultados. */
  label: z.string(),
  status: PixelPlanActionStatusSchema,
  /** El recurso creado o modificado: solo si se verificó que existe. */
  resource: PixelCreatedResourceSchema.nullable(),
  /** Motivo humano de un fallo u omisión (nunca un stack trace ni un código interno). */
  error: z.string().nullable(),
});
export type PixelPlanAction = z.infer<typeof PixelPlanActionSchema>;

/** La propuesta: lo que Pixel entendió, lo que propone y lo que creará al confirmar. */
export const PixelActionPlanSchema = z.object({
  intent: PixelCommandIntentSchema,
  summary: z.string(),
  understood: z.array(z.string()),
  proposal: z.array(z.string()),
  creates: z.array(z.string()),
  steps: z.array(PixelActionStepSchema),
  /**
   * Prompt 18: las acciones concretas (un proyecto, cada tarea) y, tras ejecutar, su resultado
   * verificado. Vacío en los pasos que aún no usan herramientas (campañas, planes, piezas, memoria).
   */
  actions: z.array(PixelPlanActionSchema).default([]),
  requiresConfirmation: z.boolean(),
  /** Cambia con cada ajuste: confirmar exige la revisión que el usuario vio. */
  revision: z.number().int().min(1),
});
export type PixelActionPlan = z.infer<typeof PixelActionPlanSchema>;

export const PixelCommandTurnSchema = z.object({
  role: z.enum(['user', 'pixel']),
  text: z.string(),
  at: IsoDateSchema,
});
export type PixelCommandTurn = z.infer<typeof PixelCommandTurnSchema>;

export const PixelCommandSourceSchema = z.enum(['text', 'voice']);
export type PixelCommandSource = z.infer<typeof PixelCommandSourceSchema>;

export const PixelCommandSchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  status: PixelCommandStatusSchema,
  intent: PixelCommandIntentSchema,
  request: z.string(),
  source: PixelCommandSourceSchema,
  turns: z.array(PixelCommandTurnSchema),
  /** needs_information: la única pregunta pendiente. */
  question: z.string().nullable(),
  /** Mensaje conversacional de Pixel (respuesta, propuesta o resultado). */
  reply: z.string().nullable(),
  plan: PixelActionPlanSchema.nullable(),
  /** Brand Guardian preflight (solo Enterprise, solo propuestas que crean recursos). */
  guardian: GuardianPreflightSummarySchema.nullable(),
  /** Prompt 19: el plan de la semana propuesto (vista humana, sin datos de Google). */
  weekPlan: WeekPlanViewSchema.nullable().default(null),
  /** Prompt 19: Pixel necesita que conectes (o reconectes) Google Calendar para seguir. */
  connect: z
    .object({ provider: z.literal('google_calendar'), status: CalendarConnectionStatusSchema })
    .nullable()
    .default(null),
  interpretation: z.object({
    mode: z.enum(['ai', 'demo', 'rules']),
    confidence: z.number().min(0).max(1),
  }),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type PixelCommand = z.infer<typeof PixelCommandSchema>;

export const PIXEL_COMMAND_REQUEST_MAX = 2000;
const requestText = z
  .string()
  .trim()
  .min(1, 'Cuéntale a Pixel qué necesitas')
  .max(PIXEL_COMMAND_REQUEST_MAX, `Máximo ${PIXEL_COMMAND_REQUEST_MAX} caracteres`);
const tzOffset = z.number().int().min(-840).max(840).default(0);
/**
 * Prompt 19: zona IANA del navegador. Solo es el TERCER recurso para planificar (después de la zona
 * del Pixel y la del Google Calendar conectado); la API la valida y la ignora si no existe.
 */
const clientTimezone = z.string().trim().min(1).max(64).optional();

/**
 * POST /api/workspaces/:workspaceId/pixel/commands. `contextHint` lo envía la pantalla desde la que
 * se escribe (Campañas → campaña; Plan de contenido → plan, y su campaña si la hay): solo orienta
 * una solicitud ambigua; la campaña se valida contra el workspace.
 */
export const CreatePixelCommandSchema = z
  .object({
    request: requestText,
    source: PixelCommandSourceSchema.default('text'),
    tzOffset,
    timezone: clientTimezone,
    contextHint: z
      .object({
        intent: z.enum(['create_campaign', 'plan_content']).optional(),
        campaignId: ObjectIdSchema.optional(),
        /**
         * Prompt 17 (Pixel Dock): el recurso que el usuario está viendo («haz tres Reels con esto»).
         * Solo orienta: el backend lo valida contra el workspace y deriva de él la campaña o el
         * proyecto; nunca es una autoridad del cliente.
         */
        resource: z
          .object({
            // Prompt 20: `task` (desde «Mi agenda»: organizar ESA tarea; los bloques quedan vinculados).
            type: z.enum(['campaign', 'content_plan', 'project', 'content_item', 'task']),
            id: ObjectIdSchema,
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CreatePixelCommandInput = z.input<typeof CreatePixelCommandSchema>;
export type CreatePixelCommandData = z.output<typeof CreatePixelCommandSchema>;

/** POST …/:commandId/adjust — responder la pregunta o ajustar la propuesta con texto libre. */
export const AdjustPixelCommandSchema = z
  .object({
    message: requestText,
    source: PixelCommandSourceSchema.default('text'),
    timezone: clientTimezone,
  })
  .strict();
export type AdjustPixelCommandInput = z.input<typeof AdjustPixelCommandSchema>;

/** POST …/:commandId/confirm — la revisión de la propuesta que el usuario vio. */
export const ConfirmPixelCommandSchema = z.object({ revision: z.number().int().min(1) }).strict();
export type ConfirmPixelCommandInput = z.input<typeof ConfirmPixelCommandSchema>;

export const PixelCommandResponseSchema = z.object({ command: PixelCommandSchema });
export type PixelCommandResponse = z.infer<typeof PixelCommandResponseSchema>;

export const PixelCommandConfirmResponseSchema = z.object({
  command: PixelCommandSchema,
  /** false = ya estaba ejecutándose o ejecutado: no se creó nada nuevo. */
  executed: z.boolean(),
});
export type PixelCommandConfirmResponse = z.infer<typeof PixelCommandConfirmResponseSchema>;

export const PIXEL_RESOURCE_LABELS: Record<PixelResourceKind, string> = {
  campaign: 'Campaña',
  content_plan: 'Plan de contenido',
  project: 'Proyecto',
  task: 'Tarea',
  content_item: 'Contenido',
  creative_memory: 'Lo que Pixel ha aprendido',
  calendar_event: 'Google Calendar',
};
