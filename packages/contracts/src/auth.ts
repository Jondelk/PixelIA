import { z } from 'zod';
import { UserSchema } from './user.js';

export const PASSWORD_MIN_LENGTH = 8;

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Introduce un email válido').max(254));

export const RegisterInputSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre').max(80, 'Máximo 80 caracteres'),
  email: EmailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(128, 'Máximo 128 caracteres'),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Escribe tu contraseña').max(128),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Respuesta de register, login y me. La sesión viaja en una cookie httpOnly, no en el cuerpo. */
export const AuthResponseSchema = z.object({ user: UserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
