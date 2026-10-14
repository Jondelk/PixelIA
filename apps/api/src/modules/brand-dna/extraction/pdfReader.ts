import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ColorSample } from '@pixel/contracts';

/*
 * Lectura local de PDF, sin IA, con pdf.js (la librería de PDF de Firefox; JavaScript puro).
 * Devuelve:
 * - el texto, reconstruido en líneas y bloques (un bloque por caja de texto o cambio de tamaño
 *   de letra), para que la lectura por secciones encuentre "Misión", "Valores"…;
 * - los colores de relleno del diseño (textos, fondos, formas) con cuántas veces se usan.
 * Un PDF escaneado (solo imágenes) no tiene texto: se informa para que el usuario lo sepa.
 */

/** Páginas que se leen como máximo (los brochures y manuales rara vez pasan de aquí). */
export const MAX_PDF_PAGES = 40;

export interface PdfContent {
  text: string;
  pages: number;
  colors: ColorSample[];
}

export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfReadError';
  }
}

interface TextItem {
  str: string;
  hasEOL: boolean;
  width: number;
  height: number;
  transform: number[];
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjs: Promise<{ lib: PdfJs; assets: string }> | null = null;

/** Carga perezosa: pdf.js solo se importa la primera vez que alguien sube un PDF. */
function loadPdfJs() {
  pdfjs ??= (async () => {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('pdfjs-dist/package.json'));
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return { lib, assets: root };
  })();
  return pdfjs;
}

/**
 * Une los fragmentos de texto en el orden en que el PDF los dibuja (que suele respetar las
 * cajas de texto y columnas del diseño). Salto de línea al cambiar de renglón; línea en blanco
 * al empezar otra caja (salto hacia arriba, hueco grande o cambio de tamaño de letra).
 */
/** "M A N U A L" (texto con espaciado amplio entre letras) → "MANUAL". */
export function collapseLetterSpacing(str: string): string {
  const tokens = str.split(' ');
  const singles = tokens.filter((token) => [...token].length === 1).length;
  const spaced =
    /^(?:\S ){2,}\S$/.test(str) ||
    /^(?:\p{Lu} )+\p{Lu}$/u.test(str) ||
    // Interletrado irregular ("E N L O C R E AT I V O"): casi todo son letras sueltas.
    (tokens.length >= 4 && singles / tokens.length >= 0.75);
  return spaced ? str.replace(/ /g, '') : str;
}

export function itemsToText(items: TextItem[]): string {
  let out = '';
  let prev: { y: number; height: number; end: number } | null = null;
  for (const item of items) {
    const y = item.transform[5] ?? 0;
    const height = Math.abs(item.height) || Math.abs(item.transform[3] ?? 0) || 1;
    if (item.str.trim()) {
      if (prev) {
        const sameLine = Math.abs(y - prev.y) < Math.max(prev.height, height) * 0.5;
        if (!sameLine) {
          const gap = prev.y - y;
          const newBlock =
            gap < 0 || // la siguiente caja empieza más arriba (otra columna)
            gap > Math.max(prev.height, height) * 1.9 ||
            Math.abs(height - prev.height) / Math.max(height, prev.height) > 0.25;
          out = out.replace(/[ \t]+$/, '');
          if (!out.endsWith('\n')) out += '\n';
          if (newBlock && !out.endsWith('\n\n')) out += '\n';
        } else if (
          out &&
          !/[\s\n]$/.test(out) &&
          (item.transform[4] ?? 0) - prev.end > Math.max(height, prev.height) * 1.1
        ) {
          // Hueco grande en el mismo renglón: elementos distintos (etiquetas, columnas cortas).
          out += ' · ';
        } else if (
          out &&
          !/[\s\n]$/.test(out) &&
          !/^\s/.test(item.str) &&
          // Espacio solo si hay un hueco real (el espaciado entre letras no separa palabras).
          (item.transform[4] ?? 0) - prev.end > height * 0.18
        ) {
          out += ' ';
        }
      }
      out += collapseLetterSpacing(item.str);
      prev = { y, height, end: (item.transform[4] ?? 0) + (item.width || 0) };
    } else if (prev && !item.str.trim() && item.width > prev.height * 1.1 && !out.endsWith(' · ')) {
      // Un "espacio" muy ancho separa elementos distintos (etiquetas en fila, tabulaciones).
      out = out.replace(/[ \t]+$/, '') + ' · ';
      prev = { y: prev.y, height: prev.height, end: (item.transform[4] ?? 0) + item.width };
    }
    if (item.hasEOL && !out.endsWith('\n')) out += '\n';
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Colores de relleno de pdf.js: "#rrggbb" (versiones recientes) o [r, g, b] (0–255). */
export function fillToHex(args: unknown): string | null {
  const value = Array.isArray(args) && args.length === 1 ? args[0] : args;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (Array.isArray(value) && value.length === 3 && value.every((c) => typeof c === 'number')) {
    return `#${value
      .map((c: number) =>
        Math.round(Math.min(255, Math.max(0, c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()}`;
  }
  return null;
}

export async function readPdfLocally(bytes: Buffer): Promise<PdfContent> {
  const { lib, assets } = await loadPdfJs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
    cMapUrl: pathToFileURL(join(assets, 'cmaps')).href + '/',
    cMapPacked: true,
    standardFontDataUrl: pathToFileURL(join(assets, 'standard_fonts')).href + '/',
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => undefined);
    const name = err instanceof Error ? err.name : '';
    throw new PdfReadError(
      name === 'PasswordException'
        ? 'El PDF está protegido con contraseña.'
        : 'El PDF está dañado o no se pudo abrir.',
    );
  }

  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const texts: string[] = [];
    const counts = new Map<string, number>();
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pageText = itemsToText(
        content.items.flatMap((item): TextItem[] =>
          'str' in item
            ? [
                {
                  str: item.str,
                  hasEOL: item.hasEOL,
                  width: item.width,
                  height: item.height,
                  transform: item.transform,
                },
              ]
            : [],
        ),
      );
      if (pageText) texts.push(pageText);

      const operators = await page.getOperatorList();
      operators.fnArray.forEach((fn, i) => {
        if (fn !== lib.OPS.setFillRGBColor) return;
        const hex = fillToHex(operators.argsArray[i]);
        if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
      });
      page.cleanup();
    }
    return {
      text: texts.join('\n\n'),
      pages: doc.numPages,
      colors: [...counts].map(([hex, weight]) => ({ hex, weight })),
    };
  } finally {
    // Libera el documento y su worker (en pdf.js 6 se cierra desde la tarea de carga).
    await task.destroy();
  }
}
