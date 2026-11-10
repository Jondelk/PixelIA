import type { ComposerSuggestion } from './PixelComposer';

/** Inicios de frase del Inicio (máximo 4): empiezan una frase, nunca abren un formulario. */
export const ENTERPRISE_SUGGESTIONS: ComposerSuggestion[] = [
  { label: 'Crear campaña', text: 'Necesito una campaña para ' },
  { label: 'Planear contenido', text: 'Necesito contenido para esta semana sobre ' },
  { label: 'Organizar trabajo', text: 'Organiza el proyecto ' },
  { label: 'Tengo una idea', text: 'Crea una pieza sobre ' },
];

/**
 * Prompt 20: con Google Calendar conectado, «Ver mi agenda» sustituye a «Organizar mi semana» (la
 * capacidad de organizar sigue: basta con pedirlo). Sin conexión, se ofrece organizar.
 */
export function personalSuggestions(
  base: string,
  calendarConnected: boolean,
): ComposerSuggestion[] {
  return PERSONAL_SUGGESTIONS.map((suggestion) =>
    calendarConnected && suggestion.label === 'Organizar mi semana'
      ? { label: 'Ver mi agenda', text: '', to: `${base}/agenda?view=week` }
      : suggestion,
  );
}

export const PERSONAL_SUGGESTIONS: ComposerSuggestion[] = [
  { label: 'Planear contenido', text: 'Necesito contenido para esta semana sobre ' },
  { label: 'Organizar trabajo', text: 'Crea tareas para ' },
  // Prompt 19: planificar con Google Calendar (si no está conectado, Pixel lo pide).
  { label: 'Organizar mi semana', text: 'Organízame la semana: ' },
  { label: '¿Qué hago hoy?', text: '¿Qué tengo pendiente hoy?' },
];
