import { z } from 'zod';

/*
 * Estado operativo que el chat Enterprise recibe (dentro de <operations_status>): conteos del
 * workspace activo y, como única excepción, las campañas ACTIVAS resumidas (nombre, objetivo y
 * estado; máximo OPERATIONS_STATUS_CAMPAIGNS). Nunca nombres, listas ni detalle de proyectos,
 * tareas o contenido, ni la estrategia de las campañas: no inflar el prompt ni invitar a inventar
 * relaciones. El proveedor demo lo lee para responder "¿cómo vamos?" sin modelo.
 */

export const OPERATIONS_STATUS_CAMPAIGNS = 3;

export const OPERATIONS_STATUS_TAG = 'operations_status';

export const OperationsStatusContextSchema = z.object({
  activeProjects: z.number().int().min(0),
  openTasks: z.number().int().min(0),
  overdueTasks: z.number().int().min(0),
  activeContentItems: z.number().int().min(0),
  activeCampaigns: z.number().int().min(0).default(0),
  campaigns: z
    .array(z.object({ name: z.string(), objective: z.string(), status: z.string() }))
    .max(OPERATIONS_STATUS_CAMPAIGNS)
    .default([]),
});
export type OperationsStatusContext = z.infer<typeof OperationsStatusContextSchema>;

export function renderOperationsStatusContext(context: OperationsStatusContext): string {
  return `<${OPERATIONS_STATUS_TAG}>\n${JSON.stringify(context)}\n</${OPERATIONS_STATUS_TAG}>`;
}

export function extractOperationsStatusContext(system: string): OperationsStatusContext | null {
  const match = system.match(
    new RegExp(`<${OPERATIONS_STATUS_TAG}>\\n([\\s\\S]*?)\\n</${OPERATIONS_STATUS_TAG}>`),
  );
  if (!match?.[1]) return null;
  try {
    const parsed = OperationsStatusContextSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Preguntas sobre el estado del trabajo que se responden desde el estado operativo. */
export const OPERATIONS_QUESTION =
  /c[oó]mo vamos|c[oó]mo va(n)? (el|la|los|las|nuestro|nuestra) (trabajo|proyecto|lanzamiento|campa[nñ]a|contenido|tareas)|estado del trabajo|estado de (los|las|nuestros|nuestras) (proyectos|tareas)|(cu[aá]ntas?|cu[aá]ntos|todas las|todos los|lista de|dime las|dime los|mu[eé]strame (las|los)) (tareas|proyectos|contenidos?)|tareas (pendientes|vencidas|atrasadas)|qu[eé] (tenemos|hay) pendiente|campa[nñ]as? (activas?|tenemos|hay)|(qu[eé]|cu[aá]ntas) campa[nñ]as/i;
