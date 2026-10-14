import type { LoginInput, RegisterInput } from '@pixel/contracts';
import bcrypt from 'bcryptjs';
import { conflict, unauthorized } from '../../lib/errors.js';
import { isDuplicateKeyError, isObjectIdString } from '../../lib/mongo.js';
import { UserModel, type UserDocument } from './user.model.js';

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
const EMAIL_TAKEN = 'Ya existe una cuenta con ese email';

export interface AuthService {
  register(input: RegisterInput): Promise<UserDocument>;
  login(input: LoginInput): Promise<UserDocument>;
  findUserById(userId: string): Promise<UserDocument | null>;
}

export function createAuthService(options: { bcryptRounds: number }): AuthService {
  // Hash de referencia para comparar cuando el email no existe: iguala el tiempo de respuesta
  // y evita revelar qué emails están registrados.
  const dummyHash = bcrypt.hashSync('pixel-dummy-password', options.bcryptRounds);

  return {
    async register(input) {
      if (await UserModel.exists({ email: input.email })) throw conflict(EMAIL_TAKEN);

      const passwordHash = await bcrypt.hash(input.password, options.bcryptRounds);
      try {
        return await UserModel.create({ name: input.name, email: input.email, passwordHash });
      } catch (err) {
        if (isDuplicateKeyError(err)) throw conflict(EMAIL_TAKEN);
        throw err;
      }
    },

    async login(input) {
      const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
      const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) throw unauthorized(INVALID_CREDENTIALS);
      return user;
    },

    async findUserById(userId) {
      return isObjectIdString(userId) ? UserModel.findById(userId) : null;
    },
  };
}
