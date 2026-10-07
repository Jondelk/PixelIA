import type { Types } from 'mongoose';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { AvatarProfileModel } from '../avatars/avatarProfile.model.js';
import { CompanyModel, type CompanyDocument } from '../companies/company.model.js';
import { ConversationModel } from '../conversations/conversation.model.js';
import { MessageModel } from '../conversations/message.model.js';
import { WorkspaceModel, type WorkspaceDocument } from './workspace.model.js';
import { availableWorkspaceSlug } from './workspace.slug.js';

/*
 * Migración Company → Workspace (docs/WORKSPACE-MIGRATION.md).
 *
 * Una sola función idempotente, `ensureCompanyWorkspace`, la usan:
 * - la migración perezosa (requireCompanyAccess, GET /api/companies, GET /api/workspaces), para que
 *   ninguna empresa anterior a los workspaces deje de funcionar aunque no se ejecute el script;
 * - el script `scripts/migrate-companies-to-workspaces.ts`, que migra todo de una vez y verifica.
 *
 * Orden pensado para sobrevivir a una caída en cualquier punto:
 * 1. Workspace por `migratedFromCompanyId` (índice único): repetir nunca crea otro.
 * 2. Rellena workspaceId en los recursos de la empresa que aún no lo tienen.
 * 3. Por último enlaza company.workspaceId: es la marca de "migrada". Si el proceso cae antes,
 *    la siguiente ejecución repite 1–2 (sin duplicar) y termina.
 * Nunca borra ni sobrescribe datos: solo añade campos que faltan.
 *
 * Los recursos se actualizan con el driver nativo (`Model.collection`): sus modelos exigen
 * workspaceId en cada consulta (tenantScoped) y aquí, precisamente, aún no lo tienen.
 */

export interface BackfillCounts {
  avatarProfiles: number;
  conversations: number;
  messages: number;
}

const ZERO: BackfillCounts = { avatarProfiles: 0, conversations: 0, messages: 0 };

function addCounts(a: BackfillCounts, b: BackfillCounts): BackfillCounts {
  return {
    avatarProfiles: a.avatarProfiles + b.avatarProfiles,
    conversations: a.conversations + b.conversations,
    messages: a.messages + b.messages,
  };
}

/** Recursos de una empresa que todavía no tienen workspaceId. */
function pendingFilter(companyId: Types.ObjectId) {
  return { companyId, workspaceId: { $exists: false } };
}

export async function countPendingResources(companyId: Types.ObjectId): Promise<BackfillCounts> {
  const filter = pendingFilter(companyId);
  const [avatarProfiles, conversations, messages] = await Promise.all([
    AvatarProfileModel.collection.countDocuments(filter),
    ConversationModel.collection.countDocuments(filter),
    MessageModel.collection.countDocuments(filter),
  ]);
  return { avatarProfiles, conversations, messages };
}

/** Asigna el workspace a los recursos legacy de la empresa (idempotente: solo los que no lo tienen). */
export async function backfillCompanyResources(
  companyId: Types.ObjectId,
  workspaceId: Types.ObjectId,
): Promise<BackfillCounts> {
  const filter = pendingFilter(companyId);
  const [avatars, conversations, messages] = await Promise.all([
    AvatarProfileModel.collection.updateMany(filter, {
      $set: { workspaceId, sourceType: 'brand' },
    }),
    ConversationModel.collection.updateMany(filter, {
      $set: { workspaceId, contextType: 'enterprise' },
    }),
    MessageModel.collection.updateMany(filter, { $set: { workspaceId } }),
  ]);
  return {
    avatarProfiles: avatars.modifiedCount,
    conversations: conversations.modifiedCount,
    messages: messages.modifiedCount,
  };
}

/** El workspace nacido de esta empresa: lo encuentra o lo crea (nunca dos). */
async function upsertMigrationWorkspace(
  company: CompanyDocument,
): Promise<{ workspace: WorkspaceDocument; created: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const existing = await WorkspaceModel.findOne({
      migratedFromCompanyId: company._id,
      ownerId: company.ownerId,
    });
    if (existing) return { workspace: existing, created: false };

    const slug = await availableWorkspaceSlug(company.ownerId, company.name);
    try {
      const workspace = await WorkspaceModel.create({
        ownerId: company.ownerId,
        type: 'enterprise',
        name: company.name,
        slug,
        status: 'active',
        migratedFromCompanyId: company._id,
        // Conserva el orden de "Tus Pixels": el workspace "existe" desde que existe la empresa.
        createdAt: company.createdAt,
      });
      return { workspace, created: true };
    } catch (err) {
      // Otra petición o ejecución lo creó a la vez (o compitió por el slug): se vuelve a buscar.
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }
}

export interface CompanyWorkspaceResult {
  company: CompanyDocument;
  workspace: WorkspaceDocument;
  /** true si esta llamada creó el workspace. */
  created: boolean;
  backfilled: BackfillCounts;
}

/**
 * Garantiza que la empresa pertenece a un workspace enterprise del mismo dueño.
 * Empresas ya migradas: solo lee su workspace. Lanza si el enlace apunta a un workspace inexistente
 * o de otro dueño (datos corruptos: no se "repara" en silencio).
 */
export async function ensureCompanyWorkspace(
  company: CompanyDocument,
): Promise<CompanyWorkspaceResult> {
  if (company.workspaceId) {
    const workspace = await WorkspaceModel.findOne({
      _id: company.workspaceId,
      ownerId: company.ownerId,
      type: 'enterprise',
    });
    if (!workspace) {
      throw new Error(
        `La empresa ${company._id.toString()} apunta a un workspace inexistente o ajeno`,
      );
    }
    return { company, workspace, created: false, backfilled: ZERO };
  }

  const { workspace, created } = await upsertMigrationWorkspace(company);
  const backfilled = await backfillCompanyResources(company._id, workspace._id);
  await CompanyModel.updateOne(
    { _id: company._id, ownerId: company.ownerId, workspaceId: null },
    { $set: { workspaceId: workspace._id } },
  );
  const linked = await CompanyModel.findOne({ _id: company._id, ownerId: company.ownerId });
  if (!linked?.workspaceId?.equals(workspace._id)) {
    throw new Error(`No se pudo enlazar la empresa ${company._id.toString()} con su workspace`);
  }
  return { company: linked, workspace, created, backfilled };
}

/** Migración perezosa de todas las empresas legacy de un usuario. */
export async function ensureOwnerWorkspaces(ownerId: string | Types.ObjectId): Promise<void> {
  const legacy = await CompanyModel.find({ ownerId, workspaceId: null });
  for (const company of legacy) await ensureCompanyWorkspace(company);
}

export interface MigrationReport {
  dryRun: boolean;
  companiesScanned: number;
  /** Empresas sin workspace al empezar (las que se migran, o se migrarían en dry-run). */
  companiesToMigrate: number;
  workspacesCreated: number;
  companiesLinked: number;
  backfilled: BackfillCounts;
  verification: {
    companiesWithoutWorkspace: number;
    resourcesWithoutWorkspace: BackfillCounts;
    /** Workspaces de migración cuya empresa no apunta a ellos (interrupción a medias). */
    unlinkedMigrationWorkspaces: number;
    ok: boolean;
  };
  errors: { companyId: string; message: string }[];
}

async function verify(): Promise<MigrationReport['verification']> {
  const missing = { workspaceId: { $exists: false } };
  const [companiesWithoutWorkspace, avatarProfiles, conversations, messages, migrationWorkspaces] =
    await Promise.all([
      CompanyModel.countDocuments({ workspaceId: null }),
      AvatarProfileModel.collection.countDocuments(missing),
      ConversationModel.collection.countDocuments(missing),
      MessageModel.collection.countDocuments(missing),
      WorkspaceModel.find(
        { migratedFromCompanyId: { $exists: true } },
        { migratedFromCompanyId: 1 },
      ).lean(),
    ]);
  let unlinkedMigrationWorkspaces = 0;
  for (const workspace of migrationWorkspaces) {
    const linked = await CompanyModel.exists({
      _id: workspace.migratedFromCompanyId,
      workspaceId: workspace._id,
    });
    if (!linked) unlinkedMigrationWorkspaces += 1;
  }
  const resourcesWithoutWorkspace = { avatarProfiles, conversations, messages };
  return {
    companiesWithoutWorkspace,
    resourcesWithoutWorkspace,
    unlinkedMigrationWorkspaces,
    ok:
      companiesWithoutWorkspace === 0 &&
      avatarProfiles + conversations + messages === 0 &&
      unlinkedMigrationWorkspaces === 0,
  };
}

/**
 * Migra todas las empresas. Repetible: una segunda ejecución no crea nada y deja el mismo
 * resultado. En `dryRun` solo cuenta lo que haría.
 */
export async function migrateCompaniesToWorkspaces(
  options: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const dryRun = options.dryRun ?? false;
  const report: MigrationReport = {
    dryRun,
    companiesScanned: 0,
    companiesToMigrate: 0,
    workspacesCreated: 0,
    companiesLinked: 0,
    backfilled: ZERO,
    verification: {
      companiesWithoutWorkspace: 0,
      resourcesWithoutWorkspace: ZERO,
      unlinkedMigrationWorkspaces: 0,
      ok: false,
    },
    errors: [],
  };

  for await (const company of CompanyModel.find({}).sort({ _id: 1 }).cursor()) {
    report.companiesScanned += 1;
    if (!company.workspaceId) report.companiesToMigrate += 1;
    try {
      if (dryRun) {
        report.backfilled = addCounts(report.backfilled, await countPendingResources(company._id));
        continue;
      }
      if (company.workspaceId) {
        // Ya enlazada: solo recoge recursos rezagados (p. ej. escritos por una versión anterior).
        report.backfilled = addCounts(
          report.backfilled,
          await backfillCompanyResources(company._id, company.workspaceId),
        );
        continue;
      }
      const result = await ensureCompanyWorkspace(company);
      if (result.created) report.workspacesCreated += 1;
      report.companiesLinked += 1;
      report.backfilled = addCounts(report.backfilled, result.backfilled);
    } catch (err) {
      report.errors.push({
        companyId: company._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  report.verification = await verify();
  return report;
}
