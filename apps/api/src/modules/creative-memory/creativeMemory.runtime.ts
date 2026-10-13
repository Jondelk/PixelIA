import type { AIProvider } from '../../ai/index.js';
import { createLogger, type Logger } from '../../lib/logger.js';

/*
 * Dependencias de Creative Memory para los efectos secundarios que ocurren DENTRO de otros servicios
 * (aceptar una pieza, aplicar una corrección…): el registro de decisiones y el detector necesitan un
 * logger, y el sintetizador un AIProvider. Se configuran una vez al crear la app (createApp) en lugar
 * de añadir dependencias a la firma de cada servicio que registra una decisión. Sin configurar
 * (scripts, tests unitarios): logger silencioso y sin sintetizador; las reglas siguen funcionando.
 */
export interface CreativeMemoryRuntime {
  ai: AIProvider | null;
  logger: Logger;
}

let runtime: CreativeMemoryRuntime = {
  ai: null,
  logger: createLogger({ level: 'silent', format: 'json' }),
};

export function configureCreativeMemory(next: CreativeMemoryRuntime): void {
  runtime = next;
}

export function memoryRuntime(): CreativeMemoryRuntime {
  return runtime;
}
