import { DEFAULT_TIMEZONE, isValidTimezone } from '@pixel/contracts';
import { z } from 'zod';

export const SERVICE_NAME = 'pixel-api';
export const SERVICE_VERSION = '0.1.0';

/** Solo para desarrollo/test cuando no se define JWT_SECRET. Nunca se acepta en producción. */
const DEV_JWT_SECRET = 'pixel-dev-only-secret-change-me-0123456789';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'Debe empezar por mongodb:// o mongodb+srv://')
      .default('mongodb://127.0.0.1:27017/pixel'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    JWT_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres').optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    /** anthropic | demo. Por defecto: anthropic si hay ANTHROPIC_API_KEY, si no demo. */
    AI_PROVIDER: z.enum(['anthropic', 'demo']).optional(),
    AI_MODEL: z.string().min(1).default('claude-opus-5-5'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(90_000),
    ANTHROPIC_API_KEY: z.string().optional(),
    /** Mensajes previos que entran al contexto del chat. */
    CHAT_HISTORY_LIMIT: z.coerce.number().int().min(0).max(100).default(20),
    /** "Hoy" de los workspaces sin zona horaria propia (Daily Director). IANA. */
    DEFAULT_TIMEZONE: z
      .string()
      .refine(isValidTimezone, 'Usa una zona horaria IANA, p. ej. America/Bogota')
      .default(DEFAULT_TIMEZONE),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Es obligatorio en producción',
      });
    }
  })
  .transform(({ ANTHROPIC_API_KEY, ...env }) => ({
    ...env,
    AI_PROVIDER: env.AI_PROVIDER ?? (ANTHROPIC_API_KEY ? 'anthropic' : 'demo'),
    JWT_SECRET: env.JWT_SECRET ?? DEV_JWT_SECRET,
    usingDevJwtSecret: !env.JWT_SECRET,
  }));

export type Env = z.infer<typeof EnvSchema>;

/** Valida las variables de entorno. Falla rápido con un mensaje legible. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}
