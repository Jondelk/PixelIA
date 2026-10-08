import { z } from 'zod';
import { ContentItemSchema } from './contentItem.js';
import { queryTzOffset } from './operations.js';
import { ProjectSchema } from './project.js';
import { TaskSchema } from './task.js';

/*
 * Resumen operacional de un Workspace (Inicio Personal y Enterprise): solo conteos y listas cortas
 * de datos reales. No hay recomendaciones ni planificación (eso es el Daily Director, solo
 * Personal).
 */

export const OperationsSummaryQuerySchema = z.object({ tzOffset: queryTzOffset });
export type OperationsSummaryQuery = z.output<typeof OperationsSummaryQuerySchema>;

export const OPERATIONS_SUMMARY_LIST_SIZE = 5;

export const OperationsSummarySchema = z.object({
  counts: z.object({
    activeProjects: z.number().int().min(0),
    /** Tareas pendientes: inbox, por hacer o en curso. */
    openTasks: z.number().int().min(0),
    /** Pendientes cuya fecha límite ya pasó (día local del usuario). */
    overdueTasks: z.number().int().min(0),
    contentInProduction: z.number().int().min(0),
    /** Contenido en curso: de idea a listo (sin publicados ni archivados). */
    activeContentItems: z.number().int().min(0),
  }),
  /** Pendientes con fecha límite desde hoy, la más cercana primero. */
  upcomingTasks: z.array(TaskSchema),
  /** Proyectos no archivados actualizados más recientemente. */
  recentProjects: z.array(ProjectSchema),
  /** Contenido aún sin publicar con fecha prevista desde hoy, la más cercana primero. */
  upcomingContent: z.array(ContentItemSchema),
});
export type OperationsSummary = z.infer<typeof OperationsSummarySchema>;

export const OperationsSummaryResponseSchema = z.object({ summary: OperationsSummarySchema });
export type OperationsSummaryResponse = z.infer<typeof OperationsSummaryResponseSchema>;
