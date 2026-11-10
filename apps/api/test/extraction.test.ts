import { emptyExtraction } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { toContentBlock } from '../src/ai/providers/anthropic.provider.js';
import {
  officeXmlToText,
  readDocument,
} from '../src/modules/brand-dna/extraction/documentReader.js';
import { extractLocally } from '../src/modules/brand-dna/extraction/localExtractor.js';
import {
  countFilled,
  normalizeHex,
  sanitizeExtraction,
} from '../src/modules/brand-dna/extraction/sanitize.js';
import { b64, FAKE_PDF, FAKE_PNG, makeDocx, makePptx } from './support/office.js';

const doc = (name: string, data: Buffer | string, mediaType = '') => ({
  name,
  mediaType,
  data: b64(data),
});

describe('Lectura de documentos', () => {
  it('Word: extrae el texto párrafo por párrafo y decodifica entidades', () => {
    const read = readDocument(
      doc(
        'brochure.docx',
        makeDocx(['Misión: Llevar café &amp; cultura', 'Valores: Origen, Oficio']),
      ),
    );
    expect(read).toMatchObject({ status: 'read', kind: 'text' });
    if (read.status !== 'read') throw new Error('no leído');
    expect(read.text).toBe('Misión: Llevar café & cultura\nValores: Origen, Oficio');
    expect(read.attachment).toEqual({ kind: 'text', name: 'brochure.docx', text: read.text });
  });

  it('PowerPoint: diapositivas en orden numérico', () => {
    const slides = Array.from({ length: 11 }, (_, i) => `Lámina ${i + 1}`);
    const read = readDocument(doc('deck.pptx', makePptx(slides)));
    if (read.status !== 'read') throw new Error('no leído');
    const order = [...read.text!.matchAll(/Lámina (\d+)/g)].map((m) => Number(m[1]));
    expect(order).toEqual(slides.map((_, i) => i + 1));
  });

  it('PDF e imágenes se envían tal cual al modelo; el tipo sale del contenido', () => {
    const pdf = readDocument(doc('sin-extension', FAKE_PDF, 'application/octet-stream'));
    expect(pdf).toMatchObject({ status: 'read', kind: 'pdf', attachment: { kind: 'pdf' } });
    const png = readDocument(doc('logo.jpg', FAKE_PNG));
    expect(png).toMatchObject({
      status: 'read',
      kind: 'image',
      attachment: { kind: 'image', mediaType: 'image/png' },
    });
  });

  it('texto plano (y sin BOM); rechaza binarios y formatos no soportados', () => {
    const md = readDocument(doc('notas.md', '﻿# Marca\nHola'));
    expect(md).toMatchObject({ status: 'read', kind: 'text', text: '# Marca\nHola' });
    expect(readDocument(doc('hoja.xlsx', 'algo binario\u0000'))).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('Formato no soportado'),
    });
    expect(readDocument(doc('roto.docx', Buffer.from('PK\u0003\u0004basura')))).toMatchObject({
      status: 'skipped',
    });
    expect(readDocument(doc('vacio.txt', ''))).toMatchObject({ status: 'skipped' });
  });

  it('officeXmlToText respeta tabulaciones y saltos', () => {
    expect(
      officeXmlToText('<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p><w:p>C</w:p>'),
    ).toBe('A\tB\nC');
  });
});

describe('Limpieza de la extracción', () => {
  it('normaliza colores, niveles, listas y descarta lo inválido', () => {
    const raw = emptyExtraction();
    raw.company.name = '  Café   Tinto ';
    raw.purpose.values = ['Origen', 'origen', '  ', '- Oficio', 'Comercio justo'];
    raw.communication.formality = 7.4;
    raw.communication.energy = 0;
    raw.visual.colors = [
      { hex: '6b3e26', name: 'Tostado' },
      { hex: '#6B3E26', name: 'Duplicado' },
      { hex: 'rojo', name: null },
      { hex: '#abc', name: null },
    ];
    raw.evidence = [{ field: 'company.name', source: 'a.pdf', quote: 'Café Tinto' }];
    const clean = sanitizeExtraction(raw);
    expect(clean.company.name).toBe('Café Tinto');
    expect(clean.purpose.values).toEqual(['Origen', 'Oficio', 'Comercio justo']);
    expect(clean.communication.formality).toBe(5);
    expect(clean.communication.energy).toBe(1);
    expect(clean.visual.colors).toEqual([
      { hex: '#6B3E26', name: 'Tostado' },
      { hex: '#AABBCC', name: null },
    ]);
    expect(countFilled(clean)).toBe(5);
  });

  it('respeta los máximos del onboarding', () => {
    const raw = emptyExtraction();
    raw.purpose.values = Array.from({ length: 20 }, (_, i) => `Valor ${i}`);
    raw.company.name = 'x'.repeat(500);
    const clean = sanitizeExtraction(raw);
    expect(clean.purpose.values).toHaveLength(8);
    expect(clean.company.name).toHaveLength(120);
  });

  it('si la forma no encaja, rescata los bloques válidos', () => {
    const raw = { ...emptyExtraction(), company: 'no es un objeto' } as unknown;
    const withMission = raw as ReturnType<typeof emptyExtraction>;
    withMission.purpose = { ...withMission.purpose, mission: 'Una misión clara y concreta' };
    expect(sanitizeExtraction(raw).purpose.mission).toBe('Una misión clara y concreta');
    expect(sanitizeExtraction(null)).toEqual(sanitizeExtraction(emptyExtraction()));
  });

  it('normalizeHex', () => {
    expect(normalizeHex('#fff')).toBe('#FFFFFF');
    expect(normalizeHex('1E14FF')).toBe('#1E14FF');
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('Lectura local por secciones (sin IA)', () => {
  const text = [
    '# Café Tinto',
    'Sector: Café de especialidad',
    'Misión: Llevar el mejor café colombiano a cada taza.',
    'VISIÓN',
    'Ser la marca de café artesanal más querida.',
    'Valores:',
    '- Origen',
    '- Oficio',
    '- Comercio justo',
    'Público objetivo: Amantes del café de 25 a 45 años.',
    'Tono de voz: cálido, cercano y sereno',
    'Paleta de colores',
    'Tostado #6B3E26',
    'Crema: #E8C07D',
    'Competencia: Juan Valdez; Tostadores locales',
    'En 2020 abrimos la tienda.',
  ].join('\n');

  it('toma el contenido de cada título conocido', () => {
    const x = sanitizeExtraction(extractLocally([{ name: 'marca.md', text }]));
    expect(x.company.industry).toBe('Café de especialidad');
    expect(x.purpose.mission).toBe('Llevar el mejor café colombiano a cada taza.');
    expect(x.purpose.vision).toBe('Ser la marca de café artesanal más querida.');
    expect(x.purpose.values).toEqual(['Origen', 'Oficio', 'Comercio justo']);
    expect(x.audience.targetAudience).toBe('Amantes del café de 25 a 45 años.');
    expect(x.communication.tone).toEqual(['cálido', 'cercano', 'sereno']);
    expect(x.communication.language).toBe('es');
    expect(x.visual.colors).toEqual([
      { hex: '#6B3E26', name: 'Tostado' },
      { hex: '#E8C07D', name: 'Crema' },
    ]);
    expect(x.competition.competitors).toEqual(['Juan Valdez', 'Tostadores locales']);
    expect(x.evidence.some((e) => e.field === 'purpose.mission' && e.source === 'marca.md')).toBe(
      true,
    );
  });

  it('no inventa: un texto sin títulos no llena campos', () => {
    const x = sanitizeExtraction(
      extractLocally([
        { name: 'carta.txt', text: 'Querido cliente, gracias por visitarnos en 2020.' },
      ]),
    );
    expect(x.purpose.mission).toBeNull();
    expect(x.visual.colors).toEqual([]);
  });
});

describe('Adjuntos para Claude', () => {
  it('PDF, texto e imagen se convierten en bloques de contenido', () => {
    expect(toContentBlock({ kind: 'pdf', name: 'a.pdf', data: 'QUJD' })).toEqual({
      type: 'document',
      title: 'a.pdf',
      source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' },
    });
    expect(toContentBlock({ kind: 'text', name: 'b.docx', text: 'hola' })).toMatchObject({
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: 'hola' },
    });
    expect(
      toContentBlock({ kind: 'image', name: 'c.png', mediaType: 'image/png', data: 'QUJD' }),
    ).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
  });
});
