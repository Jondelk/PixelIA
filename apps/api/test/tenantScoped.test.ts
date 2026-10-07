import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { BrandDnaModel } from '../src/modules/brand-dna/brandDna.model.js';
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
