/**
 * Migra las empresas creadas antes de los Workspaces (docs/WORKSPACE-MIGRATION.md).
 *
 *   npm run migrate:workspaces                       # migra y verifica
 *   npm run migrate:workspaces -- --dry-run          # solo cuenta lo que haría
 *   npm run migrate:workspaces -- --sync-indexes     # además elimina índices legacy no declarados
 *
 * Por cada empresa sin workspace crea un Workspace enterprise (mismo dueño y nombre), asigna
 * workspaceId a sus AvatarProfile, Conversation y Message y enlaza company.workspaceId.
 * Idempotente y repetible: nunca duplica workspaces ni borra datos. Usa MONGODB_URI (apps/api/.env).
 * Sale con código 1 si la verificación final no queda limpia.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { ConversationModel } from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { CreativeMemoryModel } from '../src/modules/creative-memory/creativeMemory.model.js';
import { migrateCompaniesToWorkspaces } from '../src/modules/workspaces/workspace.migration.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';

const MODELS = [
  WorkspaceModel,
  CompanyModel,
  AvatarProfileModel,
  ConversationModel,
  MessageModel,
  CreativeMemoryModel,
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const syncIndexes = args.has('--sync-indexes');

const out = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<number> {
  const env = loadEnv();
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  out(`MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  out(dryRun ? 'Modo: dry-run (no se escribe nada)' : 'Modo: migración');

  if (!dryRun) {
    // Los índices nuevos (sobre todo el único de migratedFromCompanyId) deben existir antes de
    // migrar: son los que impiden duplicados si dos procesos migran a la vez.
    for (const model of MODELS) {
      if (syncIndexes) {
        const dropped = await model.syncIndexes();
        if (dropped.length) out(`  ${model.modelName}: índices eliminados ${dropped.join(', ')}`);
      } else {
        await model.createIndexes();
      }
    }
    out(
      syncIndexes ? 'Índices sincronizados.' : 'Índices nuevos creados (sin eliminar los legacy).',
    );
  }

  const report = await migrateCompaniesToWorkspaces({ dryRun });
  out();
  out(`Empresas revisadas:           ${report.companiesScanned}`);
  out(`Empresas sin workspace:       ${report.companiesToMigrate}`);
  if (!dryRun) {
    out(`Workspaces creados:           ${report.workspacesCreated}`);
    out(`Empresas enlazadas:           ${report.companiesLinked}`);
  }
  const verb = dryRun ? 'por actualizar' : 'actualizados';
  out(`AvatarProfile ${verb}:  ${report.backfilled.avatarProfiles}`);
  out(`Conversation ${verb}:   ${report.backfilled.conversations}`);
  out(`Message ${verb}:        ${report.backfilled.messages}`);
  out();
  const v = report.verification;
  out('Verificación:');
  out(`  Empresas sin workspace:            ${v.companiesWithoutWorkspace}`);
  out(`  AvatarProfile sin workspace:       ${v.resourcesWithoutWorkspace.avatarProfiles}`);
  out(`  Conversation sin workspace:        ${v.resourcesWithoutWorkspace.conversations}`);
  out(`  Message sin workspace:             ${v.resourcesWithoutWorkspace.messages}`);
  out(`  Workspaces de migración sin enlace: ${v.unlinkedMigrationWorkspaces}`);
  out(`  Empresas con workspace roto:        ${v.companiesWithBrokenWorkspace}`);
  for (const error of report.errors) out(`  ERROR empresa ${error.companyId}: ${error.message}`);
  out(v.ok && report.errors.length === 0 ? 'OK: todo migrado.' : 'PENDIENTE: revisa lo anterior.');
  return dryRun || (v.ok && report.errors.length === 0) ? 0 : 1;
}

main()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    process.stderr.write(`Fallo la migración: ${err instanceof Error ? err.stack : String(err)}\n`);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
