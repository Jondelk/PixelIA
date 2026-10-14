/** Fallo del proveedor de IA, ya clasificado para que el producto decida qué responder. */
export type AIErrorKind =
  | 'unavailable' // red, timeouts, 5xx, sobrecarga
  | 'rate_limited'
  | 'refused' // el modelo declinó la petición
  | 'invalid_output' // respuesta vacía o fuera de esquema
  | 'misconfigured'; // credenciales o petición inválidas

export class AIProviderError extends Error {
  constructor(
    readonly kind: AIErrorKind,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
