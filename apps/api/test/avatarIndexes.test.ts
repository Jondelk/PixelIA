import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_AVATAR_INDEXES,
  upgradeAvatarProfileIndexes,
} from '../src/modules/avatars/avatarProfile.indexes.js';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { useTestDatabase } from './support/testApp.js';

useTestDatabase();
const { ObjectId } = mongoose.Types;

/** Documento mínimo de avatar (el concepto completo no importa para los índices). */
function avatarDoc(fields: Record<string, unknown>) {
  return {
    engine: { kind: 'deterministic', version: 'test', variation: 0 },
    concept: {},
    name: 'Test',
    baseObjectId: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...fields,
  };
}

const personal = (workspaceId = new ObjectId()) =>
  avatarDoc({ workspaceId, sourceType: 'personal', version: 1, personalDnaVersion: 1 });

describe('Índices de AvatarProfile', () => {
  it('varios avatares personales (sin companyId) no chocan entre sí', async () => {
    await AvatarProfileModel.collection.insertMany([personal(), personal(), personal()]);
    expect(await AvatarProfileModel.collection.countDocuments({ sourceType: 'personal' })).toBe(3);
  });

  it('Enterprise conserva la unicidad de versión por empresa y por workspace', async () => {
    const companyId = new ObjectId();
    const workspaceId = new ObjectId();
    const brand = () =>
      avatarDoc({ workspaceId, companyId, sourceType: 'brand', version: 1, brandDnaVersion: 1 });
    await AvatarProfileModel.collection.insertOne(brand());
    await expect(AvatarProfileModel.collection.insertOne(brand())).rejects.toMatchObject({
      code: 11000,
    });
    // Misma versión en el mismo workspace, aunque sea personal: también se rechaza.
    await expect(
      AvatarProfileModel.collection.insertOne(personal(workspaceId)),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('retira los índices legacy no parciales de una base anterior y es idempotente', async () => {
    // Base creada por la versión anterior: índice único no parcial por companyId.
    await AvatarProfileModel.collection.createIndex(
      { companyId: 1, version: -1 },
      { unique: true, name: 'companyId_1_version_-1' },
    );
    await AvatarProfileModel.collection.createIndex(
      { companyId: 1, brandDnaVersion: 1 },
      { name: 'companyId_1_brandDnaVersion_1' },
    );
    await AvatarProfileModel.collection.insertOne(personal());
    // Con el índice legacy, un segundo avatar personal v1 de otro workspace choca.
    await expect(AvatarProfileModel.collection.insertOne(personal())).rejects.toMatchObject({
      code: 11000,
    });

    expect(await upgradeAvatarProfileIndexes()).toEqual(LEGACY_AVATAR_INDEXES);
    expect(await upgradeAvatarProfileIndexes()).toEqual([]);

    const names = (await AvatarProfileModel.collection.indexes()).map((index) => index.name);
    expect(names).toEqual(expect.arrayContaining(['brand_company_version']));
    expect(names).not.toEqual(expect.arrayContaining([LEGACY_AVATAR_INDEXES[0]]));
    await AvatarProfileModel.collection.insertOne(personal());
  });

  it('en una base nueva no hay nada que retirar', async () => {
    await AvatarProfileModel.collection.drop().catch(() => undefined);
    expect(await upgradeAvatarProfileIndexes()).toEqual([]);
  });
});
