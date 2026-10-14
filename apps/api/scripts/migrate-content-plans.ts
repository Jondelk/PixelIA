/**
 * Asigna `contextType` a los ContentPlan anteriores al Prompt 14 (docs/ENTERPRISE-CONTENT.md).
 *
 *   npm run migrate:content-plans                 # migra
 *   npm run migrate:content-plans -- --dry-run    # solo cuenta lo que haría
 *
 * El contexto sale del tipo del workspace de cada plan (inmutable). Idempotente: una segunda
 * ejecución no cambia nada. No borra ni modifica el contenido de los planes. La API también la
 * ejecuta al conectar con MongoDB. Usa MONGODB_URI (apps/api/.env).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { migrateContentPlanContexts } from '../src/modules/content-plans/contentPlan.migration.js';

const dryRun = process.argv.includes('--dry-run');
const out = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<number> {
  const env = loadEnv();
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  out(`MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  out(dryRun ? 'Modo: dry-run (no se escribe nada)' : 'Modo: migración');
  const result = await migrateContentPlanContexts({ dryRun });
  out(`Planes sin contextType: ${result.pending}`);
  out(
    `${dryRun ? 'Se asignarían' : 'Asignados'}: personal ${result.byType.personal} · enterprise ${result.byType.enterprise}`,
  );
  if (result.orphaned) out(`Sin workspace (no se tocan): ${result.orphaned}`);
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
