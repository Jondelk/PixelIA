import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/modules/brand-dna/extraction/documentReader.js';
import {
  extractLocally,
  prepareLines,
  splitList,
} from '../src/modules/brand-dna/extraction/localExtractor.js';
import { sanitizeExtraction } from '../src/modules/brand-dna/extraction/sanitize.js';
import { b64, makeZip } from './support/office.js';

/*
 * Que la lectura sin IA no deje información por fuera: documentos con la forma de los brochures,
 * manuales y presentaciones reales (párrafos en varios renglones, secciones que siguen tras un
 * salto de página, títulos con apellido, tablas, viñetas de Word, notas de PowerPoint, Excel).
 */

const read = (name: string, text: string) => sanitizeExtraction(extractLocally([{ name, text }]));

/** Brochure como lo entrega un PDF: renglones partidos, guiones, bloques y páginas. */
const BROCHURE = [
  'CAFÉ TINTO',
  '',
  '¿QUIÉNES SOMOS?',
  '',
  'Somos una tostadora familiar de café de origen colombiano, fundada en Po-',
  'payán, que trabaja directamente con 40 familias caficultoras del Cauca.',
  '',
  'Cada lote se tuesta a mano en pequeñas cantidades para conservar sus notas',
  'de panela y cacao.',
  '',
  'Misión institucional',
  '',
  'Llevar el mejor café colombiano a cada taza, pagando un precio justo a',
  'quienes lo cultivan.',
  '',
  'VALORES CORPORATIVOS',
  '',
  'ORIGEN',
  'Cada grano tiene nombre y apellido.',
  'OFICIO',
  'Tostamos con paciencia, no con prisa.',
  'COMERCIO JUSTO',
  'Pagamos por encima del precio de bolsa.',
  '',
  'Nuestros servicios',
  'Café en grano y molido, suscripciones mensuales y talleres de barismo para',
  'empresas.',
  '',
  'CONTACTO',
  'Tel. 312 000 0000 · hola@cafetinto.co',
  '',
  'Slogan: Un tinto con historia',
  '',
  'Nuestra historia',
  'Empezamos en 2015 en el garaje de la abuela Rosa.',
  '',
  'En 2019 abrimos la primera tienda en el centro histórico.',
].join('\n');

describe('Brochure con la forma de un PDF real', () => {
  const x = read('brochure.pdf', BROCHURE);

  it('une los renglones partidos y las palabras con guion', () => {
    expect(prepareLines('fundada en Po-\npayán, que trabaja')).toEqual([
      'fundada en Popayán, que trabaja',
    ]);
  });

  it('toma todos los párrafos de una sección, no solo el primero', () => {
    expect(x.company.description).toContain('40 familias caficultoras del Cauca');
    expect(x.company.description).toContain('notas de panela y cacao');
    // "Nuestros servicios" también describe a la empresa: se suma, no se pierde.
    expect(x.company.description).toContain('talleres de barismo para empresas');
    expect(x.company.history).toContain('garaje de la abuela Rosa');
    expect(x.company.history).toContain('primera tienda en el centro histórico');
  });

  it('reconoce títulos con apellido ("Misión institucional", "VALORES CORPORATIVOS")', () => {
    expect(x.purpose.mission).toBe(
      'Llevar el mejor café colombiano a cada taza, pagando un precio justo a quienes lo cultivan.',
    );
    // Cada valor conserva su explicación: título y descripción quedan en un solo elemento.
    expect(x.purpose.values).toEqual([
      'Origen: Cada grano tiene nombre y apellido',
      'Oficio: Tostamos con paciencia, no con prisa',
      'Comercio justo: Pagamos por encima del precio de bolsa',
    ]);
  });

  it('lo que no tiene campo no se cuela en otros y se informa', () => {
    expect(x.company.description).not.toContain('312 000 0000');
    expect(x.notes).toContain('«CONTACTO»');
    expect(x.notes).toContain('«Slogan»');
  });
});

describe('Secciones que siguen tras un salto de página', () => {
  it('la visión continúa en la página siguiente', () => {
    const x = read(
      'manual.pdf',
      [
        'VISIÓN',
        '',
        'En 2030 seremos la marca de café de especialidad más querida del suroccidente.',
        '',
        '',
        'Lo lograremos abriendo tiendas en Cali, Pasto y Neiva.',
        '',
        'MISIÓN',
        'Llevar café de origen a cada mesa.',
      ].join('\n'),
    );
    expect(x.purpose.vision).toContain('más querida del suroccidente');
    expect(x.purpose.vision).toContain('Cali, Pasto y Neiva');
    expect(x.purpose.mission).toBe('Llevar café de origen a cada mesa.');
  });
});

describe('Listas', () => {
  it('una idea por renglón, viñetas con continuación y comas', () => {
    expect(splitList(['Calidad: cuidamos cada detalle, del grano a la taza', 'Cercanía'])).toEqual([
      'Calidad: cuidamos cada detalle, del grano a la taza',
      'Cercanía',
    ]);
    expect(splitList(['- Origen trazable', 'de cada finca', '- Servicio'])).toEqual([
      'Origen trazable de cada finca',
      'Servicio',
    ]);
    expect(splitList(['Honestidad, calidad y servicio'])).toEqual([
      'Honestidad',
      'calidad',
      'servicio',
    ]);
  });

  it('un elemento largo se recorta sin partir palabras', () => {
    const [item] = splitList([`Calidad: ${'cuidamos cada detalle del proceso '.repeat(8)}`]);
    expect(item!.length).toBeLessThanOrEqual(120);
    expect(item!.endsWith('…')).toBe(true);
    expect(item).not.toMatch(/\s\S{1,2}…$/);
  });
});

describe('Word', () => {
  const docx = (body: string) =>
    makeZip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>`,
    });
  const p = (text: string, extra = '') =>
    `<w:p>${extra}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;

  it('tablas, viñetas, títulos numerados y cuadros de texto sin duplicar', () => {
    const doc = readDocument({
      name: 'marca.docx',
      mediaType: '',
      data: b64(
        docx(
          [
            `<w:tbl><w:tr>${cell('Misión')}${cell('Llevar café de origen a cada mesa.')}</w:tr>`,
            `<w:tr>${cell('Visión')}${cell('Ser la tostadora más querida del Cauca.')}</w:tr></w:tbl>`,
            p(
              'Valores',
              '<w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>',
            ),
            p('Origen', '<w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr>'),
            p('Oficio', '<w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr>'),
            `<w:p><w:r><mc:AlternateContent><mc:Choice><w:txbxContent>${p('Público objetivo: Amantes del café.')}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${p('Público objetivo: Amantes del café.')}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>`,
            p('Tono de voz: cálido<w:br/>cercano'),
          ].join(''),
        ),
      ),
    });
    expect(doc.status).toBe('read');
    const text = doc.status === 'read' ? doc.text! : '';
    expect(text.match(/Público objetivo/g)).toHaveLength(1);
    const x = read('marca.docx', text);
    expect(x.purpose.mission).toBe('Llevar café de origen a cada mesa.');
    expect(x.purpose.vision).toBe('Ser la tostadora más querida del Cauca.');
    expect(x.purpose.values).toEqual(['Origen', 'Oficio']);
    expect(x.audience.targetAudience).toBe('Amantes del café.');
  });
});

describe('PowerPoint', () => {
  it('saltos de línea con formato, viñetas y notas del orador', () => {
    const pptx = makeZip({
      '[Content_Types].xml': '<Types/>',
      'ppt/slides/slide1.xml':
        '<p:sld><a:p><a:r><a:t>Nuestra esencia</a:t></a:r></a:p>' +
        '<a:p><a:r><a:t>Café con</a:t></a:r><a:br><a:rPr lang="es"/></a:br><a:r><a:t>historia y oficio.</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide2.xml':
        '<p:sld><a:p><a:r><a:t>Diferenciadores</a:t></a:r></a:p>' +
        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Tueste a mano</a:t></a:r></a:p>' +
        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Origen trazable</a:t></a:r></a:p></p:sld>',
      'ppt/notesSlides/notesSlide2.xml':
        '<p:notes><a:p><a:r><a:t>Competencia: Juan Valdez, Café Quindío</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>',
    });
    const doc = readDocument({ name: 'pitch.pptx', mediaType: '', data: b64(pptx) });
    const text = doc.status === 'read' ? doc.text! : '';
    const x = read('pitch.pptx', text);
    expect(x.purpose.purpose).toBe('Café con historia y oficio.');
    expect(x.competition.differentiators).toEqual(['Tueste a mano', 'Origen trazable']);
    expect(x.competition.competitors).toEqual(['Juan Valdez', 'Café Quindío']);
  });
});

describe('Excel', () => {
  it('una ficha de marca en dos columnas', () => {
    const xlsx = makeZip({
      '[Content_Types].xml': '<Types/>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Nombre</t></si><si><t>Café Tinto</t></si><si><t>Sector</t></si>' +
        '<si><t>Café de especialidad</t></si><si><t>Valores</t></si><si><t>Origen, oficio y comercio justo</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData>' +
        '<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>' +
        '<row><c t="s"><v>2</v></c><c t="s"><v>3</v></c></row>' +
        '<row><c t="s"><v>4</v></c><c t="s"><v>5</v></c></row>' +
        '</sheetData></worksheet>',
    });
    const doc = readDocument({ name: 'ficha.xlsx', mediaType: '', data: b64(xlsx) });
    expect(doc.status).toBe('read');
    const x = read('ficha.xlsx', doc.status === 'read' ? doc.text! : '');
    expect(x.company.name).toBe('Café Tinto');
    expect(x.company.industry).toBe('Café de especialidad');
    expect(x.purpose.values).toEqual(['Origen', 'oficio', 'comercio justo']);
  });
});

describe('Varios documentos', () => {
  it('suma lo que cada uno aporta al mismo campo', () => {
    const x = sanitizeExtraction(
      extractLocally([
        { name: 'a.txt', text: 'Quiénes somos: Tostadora familiar del Cauca.' },
        { name: 'b.txt', text: 'Servicios: Café en grano, suscripciones y talleres.' },
      ]),
    );
    expect(x.company.description).toContain('Tostadora familiar del Cauca.');
    expect(x.company.description).toContain('suscripciones y talleres');
  });

  it('sin sección de descripción, el párrafo de presentación la propone', () => {
    const x = read(
      'carta.txt',
      'Somos Café Tinto, una tostadora familiar que lleva el café del Cauca a todo el país desde 2015.\n\nMISIÓN\nCafé de origen en cada taza.',
    );
    expect(x.company.description).toContain('tostadora familiar');
    expect(x.evidence.some((e) => e.field === 'company.description')).toBe(true);
  });
});
