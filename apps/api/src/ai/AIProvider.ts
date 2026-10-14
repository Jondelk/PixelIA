import type { ZodType } from 'zod';

/*
 * Abstracción de IA de Pixel. El producto (servicios, rutas) solo conoce esta interfaz;
 * los SDK concretos viven en ./providers y se eligen por configuración (createAIProvider).
 */

export interface AIChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIResultMeta {
  /** 'anthropic' | 'demo' | … */
  provider: string;
  model: string;
  /** 'ai' = modelo real; 'demo' = respuestas locales sin IA (desarrollo y tests). */
  mode: 'ai' | 'demo';
  latencyMs: number;
  usage?: AIUsage;
}

export interface GenerateTextInput {
  system: string;
  messages: AIChatTurn[];
  /** Tope de tokens de salida. */
  maxOutputTokens?: number;
  /** Profundidad de razonamiento cuando el proveedor la soporta. */
  effort?: 'low' | 'medium' | 'high';
}

export interface GenerateStructuredInput<T> {
  system: string;
  prompt: string;
  schema: ZodType<T>;
  /** Nombre corto del objeto esperado (para logs y proveedores que lo usan). */
  schemaName: string;
  maxOutputTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly mode: 'ai' | 'demo';
  generateText(input: GenerateTextInput): Promise<{ text: string } & AIResultMeta>;
  generateStructuredOutput<T>(
    input: GenerateStructuredInput<T>,
  ): Promise<{ data: T } & AIResultMeta>;
}
