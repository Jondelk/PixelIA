import { CompanyResponseSchema, WorkspaceListResponseSchema } from '@pixel/contracts';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { ConversationModel } from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { migrateCompaniesToWorkspaces } from '../src/modules/workspaces/workspace.migration.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;
const { ObjectId } = mongoose.Types;

/**
 * Crea una empresa completa (ADN, avatar, conversación con mensajes) y la devuelve al estado en
 * que la dejaba la versión anterior a los workspaces: sin workspace y sin workspaceId en sus recursos.
 */
async function legacyCompany(session: Session) {
  const companyId = await createCompany(session, cafeTinto.company.name);
  await completeOnboarding(session, companyId, cafeTinto);
  await session.agent.post(`/api/companies/${companyId}/avatar/generate`).expect(201);
  const conversation = (
    await session.agent.post(`/api/companies/${companyId}/conversations`).expect(201)
  ).body.conversation.id as string;
  await session.agent
    .post(`/api/companies/${companyId}/conversations/${conversation}/messages`)
    .send({ content: 'Hola Pixel' })
    .expect(201);

  const _id = new ObjectId(companyId);
  const company = await CompanyModel.collection.findOne({ _id });
  await WorkspaceModel.collection.deleteOne({ _id: company!.workspaceId });
  await CompanyModel.collection.updateOne({ _id }, { $unset: { workspaceId: '' } });
  await AvatarProfileModel.collection.updateMany(
    { companyId: _id },
    { $unset: { workspaceId: '', sourceType: '' } },
  );
  await ConversationModel.collection.updateMany(
    { companyId: _id },
    { $unset: { workspaceId: '', contextType: '' } },
  );
  await MessageModel.collection.updateMany({ companyId: _id }, { $unset: { workspaceId: '' } });
  return { companyId, conversation };
}

async function snapshot() {
  const workspaces = await WorkspaceModel.collection.find({}).sort({ _id: 1 }).toArray();
  const companies = await CompanyModel.collection.find({}).sort({ _id: 1 }).toArray();
  return {
    workspaces: workspaces.map((w) => [w._id.toString(), w.migratedFromCompanyId?.toString()]),
    companies: companies.map((c) => [c._id.toString(), c.workspaceId?.toString()]),
  };
}

describe('Migración Company → Workspace', () => {
  it('una empresa sin workspace genera uno y sus recursos lo heredan', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId } = await legacyCompany(jhon);
    const legacyCreatedAt = (await CompanyModel.collection.findOne({
      _id: new ObjectId(companyId),
    }))!.createdAt as Date;

    const report = await migrateCompaniesToWorkspaces();
    expect(report).toMatchObject({
      companiesScanned: 1,
      companiesToMigrate: 1,
      workspacesCreated: 1,
      companiesLinked: 1,
      backfilled: { avatarProfiles: 1, conversations: 1, messages: 2 },
      errors: [],
    });
    expect(report.verification.ok).toBe(true);

    const company = await CompanyModel.findOne({ _id: companyId, ownerId: jhon.user.id });
    const workspace = await WorkspaceModel.findOne({
      _id: company!.workspaceId,
      ownerId: jhon.user.id,
    });
    expect(workspace).toMatchObject({ type: 'enterprise', name: 'Café Tinto', status: 'active' });
    expect(workspace!.createdAt.toISOString()).toBe(legacyCreatedAt.toISOString());

    const workspaceId = workspace!._id;
    expect(await AvatarProfileModel.countDocuments({ workspaceId, sourceType: 'brand' })).toBe(1);
    expect(await ConversationModel.countDocuments({ workspaceId, contextType: 'enterprise' })).toBe(
      1,
    );
    expect(await MessageModel.countDocuments({ workspaceId })).toBe(2);
  });

  it('ejecutarla dos veces da el mismo resultado y no duplica nada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    await legacyCompany(jhon);
    await createCompany(jhon, 'Ya migrada');

    await migrateCompaniesToWorkspaces();
    const first = await snapshot();
    const second = await migrateCompaniesToWorkspaces();
    expect(second).toMatchObject({
      companiesToMigrate: 0,
      workspacesCreated: 0,
      companiesLinked: 0,
      backfilled: { avatarProfiles: 0, conversations: 0, messages: 0 },
    });
    expect(second.verification.ok).toBe(true);
    expect(await snapshot()).toEqual(first);
    expect(await WorkspaceModel.countDocuments({ ownerId: jhon.user.id })).toBe(2);
  });

  it('una empresa ya migrada no genera otro workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'TINTO');
    const before = await snapshot();
    const report = await migrateCompaniesToWorkspaces();
    expect(report).toMatchObject({ companiesToMigrate: 0, workspacesCreated: 0 });
    expect(await snapshot()).toEqual(before);
    expect(
      (await CompanyModel.findOne({ _id: companyId, ownerId: jhon.user.id }))?.workspaceId,
    ).toBeDefined();
  });

  it('dry-run cuenta lo pendiente sin escribir', async () => {
    const jhon = await registerUser(app, 'Jhon');
    await legacyCompany(jhon);
    const before = await snapshot();

    const report = await migrateCompaniesToWorkspaces({ dryRun: true });
    expect(report).toMatchObject({
      dryRun: true,
      companiesToMigrate: 1,
      workspacesCreated: 0,
      backfilled: { avatarProfiles: 1, conversations: 1, messages: 2 },
    });
    expect(report.verification.ok).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it('se recupera de una migración interrumpida sin duplicar el workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId } = await legacyCompany(jhon);
    // Caída tras crear el workspace y antes de enlazar la empresa.
    const orphan = await WorkspaceModel.create({
      ownerId: jhon.user.id,
      type: 'enterprise',
      name: 'Café Tinto',
      slug: 'cafe-tinto',
      migratedFromCompanyId: companyId,
    });

    const report = await migrateCompaniesToWorkspaces();
    expect(report).toMatchObject({ workspacesCreated: 0, companiesLinked: 1, errors: [] });
    expect(report.verification.ok).toBe(true);
    const company = await CompanyModel.findOne({ _id: companyId, ownerId: jhon.user.id });
    expect(company?.workspaceId?.toString()).toBe(orphan._id.toString());
    expect(await WorkspaceModel.countDocuments({ ownerId: jhon.user.id })).toBe(1);
  });
});

describe('Migración perezosa: los datos legacy siguen funcionando sin ejecutar el script', () => {
  it('la empresa aparece en "Tus Pixels" y su avatar y conversaciones siguen ahí', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId, conversation } = await legacyCompany(jhon);

    const list = WorkspaceListResponseSchema.parse(
      (await jhon.agent.get('/api/workspaces').expect(200)).body,
    );
    expect(list.workspaces).toHaveLength(1);
    expect(list.workspaces[0]!.company?.id).toBe(companyId);

    const company = CompanyResponseSchema.parse(
      (await jhon.agent.get(`/api/companies/${companyId}`).expect(200)).body,
    ).company;
    expect(company.workspaceId).toBe(list.workspaces[0]!.workspace.id);

    const avatar = await jhon.agent.get(`/api/companies/${companyId}/avatar`).expect(200);
    expect(avatar.body.avatar).toMatchObject({ version: 1, workspaceId: company.workspaceId });
    const messages = await jhon.agent
      .get(`/api/companies/${companyId}/conversations/${conversation}/messages`)
      .expect(200);
    expect(messages.body.messages).toHaveLength(2);

    // Y el script después no encuentra nada que hacer.
    const report = await migrateCompaniesToWorkspaces();
    expect(report).toMatchObject({ companiesToMigrate: 0, workspacesCreated: 0 });
    expect(report.verification.ok).toBe(true);
  });

  it('acceder a la empresa por su ruta legacy también la migra', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId } = await legacyCompany(jhon);
    await jhon.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(await WorkspaceModel.countDocuments({ ownerId: jhon.user.id })).toBe(1);
    // Otro usuario sigue sin acceso (404) y no dispara nada.
    const bob = await registerUser(app, 'Bob');
    await bob.agent.get(`/api/companies/${companyId}`).expect(404);
    expect(await WorkspaceModel.countDocuments({ ownerId: bob.user.id })).toBe(0);
  });
});
