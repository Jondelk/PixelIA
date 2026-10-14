import { pickBrandColors } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import type { CompanyDocument } from '../src/modules/companies/company.model.js';
import { readDocument } from '../src/modules/brand-dna/extraction/documentReader.js';
import { extractOnboarding } from '../src/modules/brand-dna/extraction/extraction.service.js';
import { extractLocally, headingKey } from '../src/modules/brand-dna/extraction/localExtractor.js';
import {
  collapseLetterSpacing,
  fillToHex,
  itemsToText,
  readPdfLocally,
} from '../src/modules/brand-dna/extraction/pdfReader.js';
import { sanitizeExtraction } from '../src/modules/brand-dna/extraction/sanitize.js';
import { b64, FAKE_PNG } from './support/office.js';
import { brochurePdf, makePdf } from './support/pdf.js';
import { createLogger } from '../src/lib/logger.js';

const silentLogger = createLogger({ level: 'silent', format: 'json' });

const item = (str: string, x: number, y: number, height = 12, width = str.length * 6) => ({
  str,
  hasEOL: false,
  width,
  height,
  transform: [height, 0, 0, height, x, y],
});

describe('PDF sin IA', () => {
  it('lee el texto y los colores del diseño de un PDF real', async () => {
    const pdf = await readPdfLocally(brochurePdf());
    expect(pdf.pages).toBe(1);
    expect(pdf.text).toContain('¿QUIÉNES SOMOS?');
    expect(pdf.text).toContain('Llevar el mejor café colombiano a cada taza.');
    expect(pickBrandColors(pdf.colors)).toEqual(['#6B3E26', '#E8C07D']);
  });

  it('del brochure salen descripción, misión, valores, público y colores', async () => {
    const pdf = await readPdfLocally(brochurePdf());
    const x = sanitizeExtraction(
      extractLocally([
        { name: 'brochure.pdf', text: pdf.text, designColors: pickBrandColors(pdf.colors) },
      ]),
    );
    expect(x.company.description).toBe(
      'Somos una tostadora familiar de café de origen colombiano.',
    );
    expect(x.purpose.mission).toBe('Llevar el mejor café colombiano a cada taza.');
    expect(x.purpose.values).toEqual(['Origen', 'Oficio', 'Comercio justo']);
    expect(x.company.origin).toBeNull(); // "Origen" es un valor, no la ubicación
    expect(x.audience.targetAudience).toBe(
      'Amantes del café que valoran el origen y el ritual de la taza.',
    );
    expect(x.visual.colors.map((c) => c.hex)).toEqual(['#6B3E26', '#E8C07D']);
    expect(x.communication.language).toBe('es');
  });

  it('un PDF dañado o sin texto se explica', async () => {
    await expect(readPdfLocally(Buffer.from('%PDF-1.4 roto'))).rejects.toThrow(
      'El PDF está dañado',
    );
    const empty = await readPdfLocally(makePdf([]));
    expect(empty.text).toBe('');
  });

  it('reconstruye renglones y bloques', () => {
    const text = itemsToText([
      item('MISIÓN', 72, 700, 18),
      item('Llevar el mejor café', 72, 670),
      item('a cada taza.', 72, 656),
      item('VISIÓN', 300, 700, 18), // otra columna: vuelve a subir
      item('Ser la marca más querida.', 300, 670),
    ]);
    expect(text).toBe(
      'MISIÓN\n\nLlevar el mejor café\na cada taza.\n\nVISIÓN\n\nSer la marca más querida.',
    );
  });

  it('deshace el interletrado y lee colores de pdf.js en ambos formatos', () => {
    expect(collapseLetterSpacing('M A N U A L')).toBe('MANUAL');
    expect(collapseLetterSpacing('D E')).toBe('DE');
    expect(collapseLetterSpacing('y o')).toBe('y o');
    expect(collapseLetterSpacing('Café de origen')).toBe('Café de origen');
    expect(fillToHex(['#6b3e26'])).toBe('#6B3E26');
    expect(fillToHex([[107, 62, 38]])).toBe('#6B3E26');
    expect(fillToHex([1, 2])).toBeNull();
  });
});

describe('Títulos de brochures reales', () => {
  it.each([
    ['¿Quiénes somos?', 'quienes somos'],
    ['NUESTROS VALORES', 'valores'],
    ['Nuestra Misión', 'mision'],
    ['¡Nuestra historia!', 'historia'],
  ])('%s → %s', (heading, key) => {
    expect(headingKey(heading)).toBe(key);
  });

  it('un nombre de color por cada código, aunque compartan línea', () => {
    const x = extractLocally([{ name: 'a.txt', text: 'Paleta: Tostado #6B3E26 · Crema #E8C07D' }]);
    expect(x.visual.colors).toEqual([
      { hex: '#6B3E26', name: 'Tostado' },
      { hex: '#E8C07D', name: 'Crema' },
    ]);
  });

  it('"Origen" en mayúsculas sí es el título de ubicación', () => {
    const x = extractLocally([{ name: 'a.txt', text: 'ORIGEN\nPopayán, Cauca' }]);
    expect(x.company.origin).toBe('Popayán, Cauca');
  });
});

describe('Lectura sin IA de punta a punta (servicio)', () => {
  const company = { _id: { toString: () => 'c1' }, name: 'Café Tinto', industry: 'Café' };
  const neverAI: AIProvider = {
    name: 'fake',
    model: 'm',
    mode: 'ai',
    generateText: () => Promise.reject(new Error('no')),
    generateStructuredOutput: () => Promise.reject(new Error('No debe llamarse a la IA')),
  };
  const run = (documents: { name: string; data: Buffer }[], imageColors = []) =>
    extractOnboarding(
      company as unknown as CompanyDocument,
      {
        documents: documents.map((d) => ({ name: d.name, mediaType: '', data: b64(d.data) })),
        imageColors,
      },
      { ai: neverAI, logger: silentLogger, reader: 'local' },
    );

  it('DOCUMENT_READER=local no usa la IA aunque exista', async () => {
    const res = await run([{ name: 'brochure.pdf', data: brochurePdf() }]);
    expect(res.mode).toBe('demo');
    expect(res.extraction.purpose.mission).toBe('Llevar el mejor café colombiano a cada taza.');
    expect(res.documents).toEqual([
      { name: 'brochure.pdf', kind: 'pdf', status: 'read', reason: null },
    ]);
  });

  it('imágenes: aportan los colores medidos en el navegador', async () => {
    const res = await run([{ name: 'logo.png', data: FAKE_PNG }], [
      { document: 'logo.png', colors: ['#1E14FF', '#F2E500'] },
    ] as never);
    expect(res.extraction.visual.colors.map((c) => c.hex)).toEqual(['#1E14FF', '#F2E500']);
    expect(res.extraction.evidence[0]).toMatchObject({
      field: 'visual.colors',
      source: 'logo.png',
    });
  });

  it('una imagen sin colores y un PDF escaneado se explican', async () => {
    await expect(run([{ name: 'logo.png', data: FAKE_PNG }])).rejects.toMatchObject({
      status: 400,
    });
    const scanned = await run([
      { name: 'escaneado.pdf', data: makePdf([]) },
      { name: 'brochure.pdf', data: brochurePdf() },
    ]);
    expect(scanned.documents[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('no tiene texto'),
    });
  });

  it('el lector de documentos sigue reconociendo PDF por su firma', () => {
    expect(readDocument({ name: 'x', mediaType: '', data: b64(brochurePdf()) })).toMatchObject({
      kind: 'pdf',
      status: 'read',
    });
  });
});
