type QueryValue = string | number | readonly string[] | null | undefined;

/**
 * Query string a partir de filtros: omite vacíos y une listas con comas (`status=todo,doing`).
 * Devuelve "" o "?a=b".
 */
export function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Zona horaria del navegador para los filtros "hoy / vencidas / próximas" de la API. */
export function browserTzOffset(now = new Date()): number {
  return now.getTimezoneOffset();
}
