import type { User } from '@pixel/contracts';
import { model, Schema, type HydratedDocument } from 'mongoose';

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserAttrs>;

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    // select: false → el hash solo se carga cuando se pide explícitamente (login).
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const UserModel = model<UserAttrs>('User', userSchema);

export function toUserDTO(user: UserDocument): User {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
