import { inflateRawSync } from 'node:zlib';

/*
 * Lector ZIP mínimo para documentos de Office (.docx y .pptx son ZIP con XML dentro).
 * Solo lee entradas "stored" o "deflate" y no soporta ZIP64 (innecesario para documentos de
 * marca). Limita el tamaño descomprimido para no caer en "zip bombs".
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Tope de bytes descomprimidos por entrada. */
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export function isZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.readUInt32LE(0) === LOCAL_SIGNATURE;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError('El archivo no es un ZIP válido');
}

/** Nombres de las entradas y una función para leer cada una (perezosa). */
export function readZip(buffer: Buffer): Map<string, () => Buffer> {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, () => Buffer>();

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Directorio del ZIP dañado');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    entries.set(name, () => {
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new ZipError(`Entrada dañada: ${name}`);
      }
      const start =
        localOffset +
        30 +
        buffer.readUInt16LE(localOffset + 26) +
        buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) {
        if (size > MAX_ENTRY_BYTES) throw new ZipError(`Entrada demasiado grande: ${name}`);
        return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      }
      throw new ZipError(`Compresión no soportada en ${name}`);
    });
  }
  return entries;
}
