/**
 * Marca como `legacy` las CreativeMemory anteriores al Prompt 16 (docs/CREATIVE-MEMORY.md §14).
 *
 *   npm run migrate:creative-memories                 # migra
 *   npm run migrate:creative-memories -- --dry-run    # solo cuenta lo que haría
 *
 * No clasifica ni inventa nada: su texto libre queda conservado y fuera del retrieval. Idempotente:
 * una segunda ejecución no cambia nada. Nunca borra. La API también la ejecuta al conectar con
 * MongoDB. Usa MONGODB_URI (apps/api/.env).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { migrateLegacyCreativeMemories } from '../src/modules/creative-memory/creativeMemory.migration.js';

const dryRun = process.argv.includes('--dry-run');
const out = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<number> {
  const env = loadEnv();
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  out(`MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  out(dryRun ? 'Modo: dry-run (no se escribe nada)' : 'Modo: migración');
  const result = await migrateLegacyCreativeMemories({ dryRun });
  out(`Memorias sin estado (anteriores al Prompt 16): ${result.pending}`);
  out(
    `${dryRun ? 'Se marcarían' : 'Marcadas'} como legacy: ${dryRun ? result.pending : result.migrated}`,
  );
  await mongoose.disconnect();
  return 0;
}

main().then(
  (code) => process.exit(code),
  async (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  },
);
