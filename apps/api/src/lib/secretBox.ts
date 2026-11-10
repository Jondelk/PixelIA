import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
 * Cifrado en reposo de secretos de terceros (Prompt 19: tokens de Google Calendar). AES-256-GCM de
 * `node:crypto`: confidencialidad + integridad (la etiqueta de autenticación detecta una clave
 * equivocada o un texto alterado). IV aleatorio de 12 bytes por mensaje. Formato:
 * `v1.<iv>.<tag>.<ciphertext>` en base64url. La clave vive solo en el entorno del servidor.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/** 32 bytes en base64 (o 64 caracteres hex). Devuelve null si la clave no sirve. */
export function parseSecretKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  return key.length === 32 ? key : null;
}

export function sealSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Descifra; con una clave equivocada o un texto alterado lanza SecretBoxError (nunca devuelve basura). */
export function openSecret(sealed: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new SecretBoxError('Formato de secreto no reconocido');
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecretBoxError('No se pudo descifrar el secreto (clave o datos no válidos)');
  }
}
