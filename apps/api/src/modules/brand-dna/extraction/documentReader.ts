import type { AIAttachment } from '../../../ai/index.js';
import { isZip, readZip, ZipError } from './zip.js';

/*
 * Convierte cada archivo subido en algo que la IA pueda leer:
 * - PDF e imágenes: se envían tal cual (el modelo los lee directamente).
 * - Word (.docx), PowerPoint (.pptx) y Excel (.xlsx): se extrae el texto aquí, sin dependencias.
 * - Texto (.txt, .md, .csv): se decodifica como UTF-8.
 * El tipo se decide por el contenido (firma del archivo) y la extensión, no por lo que diga el
 * navegador. Nada de esto se guarda en disco.
 */

export interface DocumentInput {
  name: string;
  mediaType: string;
  /** base64 */
  data: string;
}

export type ReadDocument =
  | {
      name: string;
      status: 'read';
      kind: 'pdf' | 'image' | 'text';
      bytes: number;
      attachment: AIAttachment;
      /** Texto plano (solo documentos de texto; lo usa la lectura local sin IA). */
      text: string | null;
    }
  | {
      name: string;
      status: 'skipped';
      kind: 'pdf' | 'image' | 'text' | null;
      bytes: number;
      reason: string;
    };

/** Tope de caracteres por documento de texto (lo demás se recorta). */
export const MAX_TEXT_CHARS = 120_000;

const UNSUPPORTED =
  'Formato no soportado. Usa PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), texto o imágenes.';

function extension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

function imageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null {
  if (bytes.length < 12) return null;
  if (bytes.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

/** Texto de un XML de Office: párrafos a saltos de línea, sin etiquetas, entidades decodificadas. */
export function officeXmlToText(xml: string): string {
  return decodeEntities(
    xml
      // Cuadros de texto de Word: el contenido viene dos veces (versión moderna y respaldo).
      .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
      // Viñetas y listas numeradas de Word (la viñeta no es texto: es formato del párrafo).
      // (Los títulos numerados —estilo Título/Heading— no son viñetas.)
      .replace(
        /<w:p\b[^>]*>(?=(?:(?!<\/w:p>)[\s\S])*?<w:numPr>)(?!(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="(?:Heading|Ttulo|Titulo|Title|Subtitle)[^"]*")/g,
        '$&- ',
      )
      // Viñetas de PowerPoint declaradas en el párrafo.
      .replace(/<a:p\b[^>]*>(?=(?:(?!<\/a:p>)[\s\S])*?<a:buChar\b)/g, '$&- ')
      .replace(/<w:tab\/>|<a:tab\/>/g, '\t')
      .replace(
        /<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<a:br\b[^>]*\/>|<a:br\b[^>]*>[\s\S]*?<\/a:br>/g,
        '\n',
      )
      // Tablas: cada fila en su renglón y las celdas separadas (no pegadas entre sí).
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<\/w:tr>|<\/w:p>|<\/a:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\t+\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Texto de una hoja de Excel: una fila por renglón; dos celdas → "Etiqueta: valor". */
export function sheetText(sheetXml: string, shared: string[]): string {
  const rows: string[] = [];
  for (const row of sheetXml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const cell of row.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) ?? []) {
      const type = /\bt="([^"]+)"/.exec(cell)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(/<v>(\d+)<\/v>/.exec(cell)?.[1])] ?? '';
      else if (type === 'inlineStr') value = officeXmlToText(cell);
      else value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '');
      if (value.trim()) cells.push(value.trim());
    }
    if (cells.length === 2) rows.push(`${cells[0]}: ${cells[1]}`);
    else if (cells.length) rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

/**
 * Texto de un .docx (cuerpo y notas al pie), de un .pptx (diapositivas en orden y sus notas)
 * o de un .xlsx (hojas en orden).
 */
export function officeText(bytes: Buffer): string | null {
  const entries = readZip(bytes);
  const read = (name: string) => entries.get(name)?.().toString('utf8') ?? null;
  const document = read('word/document.xml');
  if (document !== null) {
    const footnotes = read('word/footnotes.xml');
    return [officeXmlToText(document), footnotes ? officeXmlToText(footnotes) : '']
      .filter(Boolean)
      .join('\n\n');
  }

  const numbered = (pattern: RegExp) =>
    [...entries.keys()]
      .map((name) => ({ name, n: Number(pattern.exec(name)?.[1]) }))
      .filter((entry) => Number.isFinite(entry.n) && entry.n > 0)
      .sort((a, b) => a.n - b.n);

  const slides = numbered(/^ppt\/slides\/slide(\d+)\.xml$/);
  if (slides.length) {
    return slides
      .map(({ name, n }) => {
        const body = officeXmlToText(read(name)!);
        // Las notas del orador suelen ampliar lo que la diapositiva solo enuncia.
        const notesXml = read(`ppt/notesSlides/notesSlide${n}.xml`);
        const notes = notesXml
          ? officeXmlToText(notesXml)
              .split('\n')
              .filter((line) => line.trim() && !/^\d+$/.test(line.trim()))
              .join('\n')
          : '';
        return `Diapositiva ${n}\n${body}${notes ? `\n\n${notes}` : ''}`;
      })
      .join('\n\n');
  }

  const sheets = numbered(/^xl\/worksheets\/sheet(\d+)\.xml$/);
  if (sheets.length) {
    const sharedXml = read('xl/sharedStrings.xml') ?? '';
    const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
      officeXmlToText(si).replace(/\n+/g, ' '),
    );
    return sheets
      .map(({ name }) => sheetText(read(name)!, shared))
      .filter(Boolean)
      .join('\n\n');
  }
  return null;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}\n[… documento recortado]`
    : text;
}

export function readDocument(input: DocumentInput): ReadDocument {
  const name = input.name.replace(/[\r\n]/g, ' ').trim();
  const bytes = Buffer.from(input.data, 'base64');
  const size = bytes.length;
  if (size === 0)
    return { name, status: 'skipped', kind: null, bytes: 0, reason: 'Archivo vacío.' };

  const ext = extension(name);
  const media = input.mediaType.toLowerCase();

  if (bytes.toString('ascii', 0, 5) === '%PDF-') {
    return {
      name,
      status: 'read',
      kind: 'pdf',
      bytes: size,
      attachment: { kind: 'pdf', name, data: bytes.toString('base64') },
      text: null,
    };
  }

  const image = imageType(bytes);
  if (image) {
    return {
      name,
      status: 'read',
      kind: 'image',
      bytes: size,
      attachment: { kind: 'image', name, mediaType: image, data: bytes.toString('base64') },
      text: null,
    };
  }

  if (
    isZip(bytes) &&
    (['docx', 'pptx', 'xlsx'].includes(ext) || media.includes('officedocument'))
  ) {
    try {
      const text = officeText(bytes)?.trim();
      if (!text)
        return { name, status: 'skipped', kind: 'text', bytes: size, reason: 'No tiene texto.' };
      const content = truncate(text);
      return {
        name,
        status: 'read',
        kind: 'text',
        bytes: size,
        attachment: { kind: 'text', name, text: content },
        text: content,
      };
    } catch (err) {
      const reason =
        err instanceof ZipError
          ? 'El archivo de Office está dañado.'
          : 'No se pudo leer el archivo.';
      return { name, status: 'skipped', kind: 'text', bytes: size, reason };
    }
  }

  if (['txt', 'md', 'markdown', 'csv'].includes(ext) || media.startsWith('text/')) {
    const text = bytes.toString('utf8').replace(/^﻿/, '').trim();
    if (!text || text.includes('\u0000')) {
      return {
        name,
        status: 'skipped',
        kind: 'text',
        bytes: size,
        reason: 'No tiene texto legible.',
      };
    }
    const content = truncate(text);
    return {
      name,
      status: 'read',
      kind: 'text',
      bytes: size,
      attachment: { kind: 'text', name, text: content },
      text: content,
    };
  }

  return { name, status: 'skipped', kind: null, bytes: size, reason: UNSUPPORTED };
}
