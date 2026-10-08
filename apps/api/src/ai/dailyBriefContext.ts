import { z } from 'zod';

/*
 * Resumen de la dirección del día que el chat Personal recibe (dentro de <daily_brief>). Solo la
 * vigente de hoy, acotada: resumen, prioridades y avisos. El proveedor demo lo lee para responder
 * "¿qué hago ahora?" sin modelo.
 */

export const DAILY_BRIEF_TAG = 'daily_brief';

export const DailyBriefContextSchema = z.object({
  localDate: z.string(),
  stale: z.boolean(),
  summary: z.string(),
  priorities: z.array(z.object({ title: z.string(), rationale: z.string(), urgency: z.string() })),
  warnings: z.array(z.string()),
  content: z.string().nullable(),
  focus: z.array(z.string()),
});
export type DailyBriefContext = z.infer<typeof DailyBriefContextSchema>;

export function renderDailyBriefContext(context: DailyBriefContext): string {
  return `<${DAILY_BRIEF_TAG}>\n${JSON.stringify(context)}\n</${DAILY_BRIEF_TAG}>`;
}

export function extractDailyBriefContext(system: string): DailyBriefContext | null {
  const match = system.match(
    new RegExp(`<${DAILY_BRIEF_TAG}>\\n([\\s\\S]*?)\\n</${DAILY_BRIEF_TAG}>`),
  );
  if (!match?.[1]) return null;
  try {
    const parsed = DailyBriefContextSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Preguntas que se responden desde la dirección del día. */
export const DAILY_QUESTION =
  /qu[eé] (hago|deber[ií]a hacer|hago primero|toca)|por d[oó]nde empiezo|urgente|atrasad|vencid|prioridad|qu[eé] merece|mi d[ií]a|para hoy/i;
