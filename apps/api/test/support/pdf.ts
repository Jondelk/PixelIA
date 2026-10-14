/**
 * PDF mínimo y válido para pruebas: una página A4, Helvetica (WinAnsi, admite tildes) y, para cada
 * línea, su tamaño, posición y color de relleno. También puede dibujar rectángulos de color.
 */
export interface PdfLine {
  text: string;
  size?: number;
  x?: number;
  y: number;
  /** Color del texto, "#RRGGBB" (negro por defecto). */
  color?: string;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const rg = (hex: string) =>
  [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ') + ' rg';

const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(lines: PdfLine[], rects: PdfRect[] = []): Buffer {
  const content = [
    ...rects.map((r) => `${rg(r.color)} ${r.x} ${r.y} ${r.width} ${r.height} re f`),
    ...lines.map(
      (line) =>
        `${rg(line.color ?? '#000000')} BT /F1 ${line.size ?? 12} Tf ${line.x ?? 72} ${line.y} Td (${escape(line.text)}) Tj ET`,
    ),
  ].join('\n');
  const stream = Buffer.from(content, 'latin1');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  const push = (chunk: Buffer) => {
    parts.push(chunk);
    length += chunk.length;
  };
  objects.forEach((body, i) => {
    offsets.push(length);
    push(Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
  });
  offsets.push(length);
  push(Buffer.from(`5 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'));
  push(stream);
  push(Buffer.from('\nendstream\nendobj\n', 'latin1'));

  const xref = length;
  const entries = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  push(
    Buffer.from(
      `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      'latin1',
    ),
  );
  return Buffer.concat(parts);
}

/** Brochure de ejemplo: títulos en mayúsculas, párrafos, valores en líneas y colores de marca. */
export function brochurePdf(): Buffer {
  return makePdf(
    [
      { text: 'Café Tinto', size: 32, y: 780, color: '#6B3E26' },
      { text: '¿QUIÉNES SOMOS?', size: 16, y: 720, color: '#6B3E26' },
      { text: 'Somos una tostadora familiar de café de origen colombiano.', y: 700 },
      { text: 'NUESTRA MISIÓN', size: 16, y: 650, color: '#6B3E26' },
      { text: 'Llevar el mejor café colombiano a cada taza.', y: 630 },
      { text: 'NUESTROS VALORES', size: 16, y: 580, color: '#6B3E26' },
      { text: 'Origen', y: 560 },
      { text: 'Oficio', y: 545 },
      { text: 'Comercio justo', y: 530 },
      { text: '¿A QUIÉN VA DIRIGIDO?', size: 16, y: 480, color: '#6B3E26' },
      { text: 'Amantes del café que valoran el origen y el ritual de la taza.', y: 460 },
    ],
    [
      { x: 0, y: 0, width: 595, height: 60, color: '#6B3E26' },
      { x: 0, y: 60, width: 595, height: 20, color: '#E8C07D' },
    ],
  );
}
