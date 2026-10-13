import {
  PixelCommandEntitiesSchema,
  PixelCommandIntentSchema,
  WorkspaceTypeSchema,
} from '@pixel/contracts';
import { z } from 'zod';

/*
 * Entrada controlada del intérprete de PixelCommand (dentro de <pixel_command_input>): el tipo de
 * workspace, las intenciones que admite (de sus capacidades), la solicitud y, si es un ajuste o una
 * respuesta, la interpretación anterior. Nada más: ni ADN, ni ids, ni nombres de recursos. El
 * intérprete solo entiende el lenguaje; el backend valida capacidades, pertenencia y campos.
 */

export const PIXEL_COMMAND_SCHEMA_NAME = 'pixel_command_interpretation';

export const PixelCommandPayloadSchema = z.object({
  workspaceType: WorkspaceTypeSchema,
  availableIntents: z.array(PixelCommandIntentSchema).min(1),
  userRequest: z.string(),
  /** Ajuste o respuesta a una pregunta: lo entendido hasta ahora (el texto nuevo lo modifica). */
  previous: z
    .object({
      intent: PixelCommandIntentSchema,
      request: z.string(),
      entities: PixelCommandEntitiesSchema,
    })
    .nullable(),
});
export type PixelCommandPayload = z.infer<typeof PixelCommandPayloadSchema>;

export const PIXEL_COMMAND_SYSTEM = `Eres el intérprete de solicitudes de Pixel, un director creativo. Recibes lo que
el usuario escribió y devuelves SOLO su intención y los datos que él mismo dijo.

- intent: una de availableIntents. create_campaign = lanzar, promocionar o hacer una campaña;
  plan_content = contenido o publicaciones para un periodo; create_content = guardar UNA pieza concreta;
  organize_project = crear u ordenar un proyecto; create_tasks = apuntar tareas; creative_advice =
  opinión, ideas o qué publicar (no crea nada); work_status = cómo va el trabajo; manage_memory =
  recordar, olvidar o mostrar lo que Pixel ha aprendido; unknown si no encaja.
- manage_memory SOLO con una expresión claramente persistente ("de ahora en adelante", "siempre",
  "nunca", "recuerda que", "no vuelvas a", "para esta marca", "solo en esta campaña podemos…") o
  al pedir olvidar o ver lo aprendido. "Hoy no quiero Stories" o "esta vez…" NO es memoria: es la
  solicitud actual (excludedFormats / formats). memoryAction: remember | forget | show; memoryText:
  la preferencia en palabras del usuario; memoryScopeHint: campaign si dice "esta campaña" o "solo en
  la campaña…", workspace si dice "en general", "para la marca", "siempre"…; si no lo dice, null.
- entities: solo lo que está en el texto (producto, tema, periodo, plataformas, formatos, número de
  piezas, campaña o proyecto mencionados, tareas listadas). Nunca tono, colores, audiencia ni
  personalidad: Pixel ya los conoce por el ADN. Si algo no se dijo, null o lista vacía.
- Si previous no es null, el texto nuevo AJUSTA esa solicitud: conserva lo anterior salvo lo que
  cambie ("quita Stories" → excludedFormats incluye story; "solo Instagram" → platforms = instagram).
- confidence: 0–1. missingRequiredInformation: solo lo imprescindible que falta.`;

export function pixelCommandPrompt(payload: PixelCommandPayload): string {
  return `Interpreta esta solicitud (JSON):\n<pixel_command_input>\n${JSON.stringify(payload)}\n</pixel_command_input>`;
}

/** Lee la entrada del intérprete de un prompt (null si no lo es o está corrupta). */
export function extractPixelCommandPayload(prompt: string): PixelCommandPayload | null {
  const match = /<pixel_command_input>\s*([\s\S]*?)\s*<\/pixel_command_input>/.exec(prompt);
  if (!match) return null;
  try {
    const parsed = PixelCommandPayloadSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
