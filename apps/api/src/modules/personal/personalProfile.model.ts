import type { PersonalOnboardingDraft, PersonalProfile } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * PersonalProfile: quién es la persona de un Pixel Personal (Workspace personal → PersonalProfile).
 * Uno por workspace. Es un recurso del workspace: toda consulta filtra por workspaceId (tenantScoped).
 */

export interface PersonalProfileAttrs {
  workspaceId: Types.ObjectId;
  /** Dueño del workspace (siempre `workspace.ownerId`, nunca un dato del cliente). */
  userId: Types.ObjectId;
  name: string;
  headline: string | null;
  bio: string | null;
  profession: string | null;
  roles: string[];
  skills: string[];
  interests: string[];
  location: string | null;
  /** Respuestas del onboarding personal, por paso. Se validan con Zod al guardarse y al leerse. */
  onboarding: { answers: PersonalOnboardingDraft; updatedAt: Date | null };
  personalDnaVersion: number | null;
  avatarVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PersonalProfileDocument = HydratedDocument<PersonalProfileAttrs>;

const personalProfileSchema = new Schema<PersonalProfileAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '', trim: true, maxlength: 120 },
    headline: { type: String, default: null, maxlength: 160 },
    bio: { type: String, default: null, maxlength: 1000 },
    profession: { type: String, default: null, maxlength: 120 },
    roles: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    location: { type: String, default: null, maxlength: 120 },
    onboarding: {
      answers: { type: Schema.Types.Mixed, default: () => ({}) },
      updatedAt: { type: Date, default: null },
    },
    personalDnaVersion: { type: Number, default: null, min: 1 },
    avatarVersion: { type: Number, default: null, min: 1 },
  },
  { timestamps: true, minimize: false },
);

// Un perfil por workspace personal (también resuelve la carrera de dos primeros guardados a la vez).
personalProfileSchema.index({ workspaceId: 1 }, { unique: true });
personalProfileSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const PersonalProfileModel = model<PersonalProfileAttrs>(
  'PersonalProfile',
  personalProfileSchema,
  'personal_profiles',
);

export function toPersonalProfileDTO(doc: PersonalProfileDocument): PersonalProfile {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    headline: doc.headline ?? null,
    bio: doc.bio ?? null,
    profession: doc.profession ?? null,
    roles: [...doc.roles],
    skills: [...doc.skills],
    interests: [...doc.interests],
    location: doc.location ?? null,
    personalDnaVersion: doc.personalDnaVersion ?? null,
    avatarVersion: doc.avatarVersion ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
