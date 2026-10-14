import { z } from 'zod';

/*
 * Primitivas de validación compartidas por los onboardings (marca y personal).
 * Mensajes en español: llegan tal cual a los formularios.
 */

export const text = (label: string, min = 2, max = 2000) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `Completa: ${label}` : `${label}: mínimo ${min} caracteres`)
    .max(max, `${label}: máximo ${max} caracteres`);

/** Texto opcional: vacío → null. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((value) => value || null)
    .nullable()
    .default(null);

/** Lista de frases cortas: recorta, quita vacíos y duplicados (sin distinguir mayúsculas). */
export const list = (label: string, { min = 0, max = 12 }: { min?: number; max?: number } = {}) =>
  z
    .array(z.string().trim().max(120, `${label}: cada elemento admite máximo 120 caracteres`))
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.toLocaleLowerCase('es');
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .pipe(
      z
        .array(z.string())
        .min(
          min,
          min === 1
            ? `Añade al menos un elemento en: ${label}`
            : `Añade al menos ${min} en: ${label}`,
        )
        .max(max, `${label}: máximo ${max} elementos`),
    );

export const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-f]{6})$/i, 'Usa un color hexadecimal, p. ej. #6B3E26')
  .transform((value) => value.toUpperCase());

/** Nivel de 1 a 5 (formalidad, energía…). */
export const level = (label: string) =>
  z
    .number({ error: `Elige un nivel de ${label}` })
    .int()
    .min(1)
    .max(5);
