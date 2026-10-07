import mongoose, { type Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { BrandDnaModel } from '../src/modules/brand-dna/brandDna.model.js';
import { ConversationModel } from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { CreativeMemoryModel } from '../src/modules/creative-memory/creativeMemory.model.js';
import { useTestDatabase } from './support/testApp.js';

useTestDatabase();

describe('plugin tenantScoped', () => {
  const companyId = new mongoose.Types.ObjectId();

  it('rechaza consultas sin companyId, incluso por _id', async () => {
    await expect(BrandDnaModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(BrandDnaModel.findById(new mongoose.Types.ObjectId())).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(BrandDnaModel.countDocuments({ version: 1 })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(BrandDnaModel.updateMany({}, { version: 2 })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(BrandDnaModel.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(BrandDnaModel.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(
      TenantScopeError,
    );
  });

  it('permite consultas filtradas por companyId', async () => {
    await expect(BrandDnaModel.find({ companyId })).resolves.toEqual([]);
    await expect(BrandDnaModel.countDocuments({ companyId })).resolves.toBe(0);
    await expect(BrandDnaModel.aggregate([{ $match: { companyId } }])).resolves.toEqual([]);
  });
});

describe('plugin tenantScoped por workspaceId', () => {
  const workspaceId = new mongoose.Types.ObjectId();
  const companyId = new mongoose.Types.ObjectId();
  // Mismo comportamiento en los cuatro modelos; se tratan como modelos genéricos para iterarlos.
  const models = [
    AvatarProfileModel,
    ConversationModel,
    MessageModel,
    CreativeMemoryModel,
  ] as unknown as Model<Record<string, unknown>>[];

  it('los recursos del workspace rechazan consultas sin workspaceId, aunque traigan companyId', async () => {
    for (const model of models) {
      await expect(model.find({})).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.find({ companyId })).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.countDocuments({ workspaceId: null })).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.aggregate([{ $match: { companyId } }])).rejects.toBeInstanceOf(
        TenantScopeError,
      );
    }
  });

  it('exige un valor concreto: operadores como $exists, $ne o $in no valen', async () => {
    for (const model of models) {
      for (const workspaceFilter of [
        { $exists: true },
        { $ne: null },
        { $in: [workspaceId] },
        '',
      ]) {
        await expect(model.find({ workspaceId: workspaceFilter })).rejects.toBeInstanceOf(
          TenantScopeError,
        );
      }
      await expect(model.estimatedDocumentCount()).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        model.bulkWrite([{ deleteMany: { filter: { companyId } } }]),
      ).rejects.toBeInstanceOf(TenantScopeError);
    }
  });

  it('permite consultas filtradas por workspaceId', async () => {
    for (const model of models) {
      await expect(model.countDocuments({ workspaceId })).resolves.toBe(0);
      await expect(model.countDocuments({ workspaceId: { $eq: workspaceId } })).resolves.toBe(0);
      await expect(model.countDocuments({ workspaceId: workspaceId.toString() })).resolves.toBe(0);
      await expect(
        model.bulkWrite([{ deleteMany: { filter: { workspaceId } } }]),
      ).resolves.toBeDefined();
      await expect(model.aggregate([{ $match: { workspaceId } }])).resolves.toEqual([]);
    }
  });
});
