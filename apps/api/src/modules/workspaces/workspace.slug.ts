import type { Types } from 'mongoose';
import { escapeRegex } from '../../lib/mongo.js';
import { nextAvailableSlug, slugify } from '../companies/slug.js';
import { WorkspaceModel } from './workspace.model.js';

/** Primer slug libre entre los workspaces del dueño: base, base-2, base-3… */
export async function availableWorkspaceSlug(
  ownerId: string | Types.ObjectId,
  name: string,
): Promise<string> {
  const base = slugify(name, 'pixel');
  const existing = await WorkspaceModel.find(
    { ownerId, slug: { $regex: `^${escapeRegex(base)}(-\\d+)?$` } },
    { slug: 1 },
  ).lean();
  return nextAvailableSlug(base, new Set(existing.map((workspace) => workspace.slug)));
}
