import type { ComposerSuggestion } from './PixelComposer';

/** Inicios de frase del Inicio (máximo 4): empiezan una frase, nunca abren un formulario. */
export const ENTERPRISE_SUGGESTIONS: ComposerSuggestion[] = [
  { label: 'Crear campaña', text: 'Necesito una campaña para ' },
  { label: 'Planear contenido', text: 'Necesito contenido para esta semana sobre ' },
  { label: 'Organizar trabajo', text: 'Organiza el proyecto ' },
  { label: 'Tengo una idea', text: 'Crea una pieza sobre ' },
];

export const PERSONAL_SUGGESTIONS: ComposerSuggestion[] = [
  { label: 'Planear contenido', text: 'Necesito contenido para esta semana sobre ' },
  { label: 'Organizar trabajo', text: 'Crea tareas para ' },
  { label: 'Tengo una idea', text: 'Crea una pieza sobre ' },
  { label: '¿Qué hago hoy?', text: '¿Qué tengo pendiente hoy?' },
];
