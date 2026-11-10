import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/ai/providers/anthropic.provider.js';
import { createLogger } from '../src/lib/logger.js';
import { createPixelIntentResolver } from '../src/modules/pixel-command/pixelIntent.resolver.js';

/**
 * Pixel Action Foundation con Claude real (Prompt 18 §149). Solo corre con ANTHROPIC_API_KEY (cuesta
 * dinero y necesita red); sin ella queda SKIPPED. Las equivalentes con el proveedor demo corren
 * siempre en pixelActions.test.ts y pixelCommand.rules.test.ts.
 */
const live = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!live)('Claude real: responder, actuar o reconocer el límite', () => {
  const resolver = createPixelIntentResolver({
    ai: new AnthropicProvider({
      model: process.env.AI_MODEL ?? 'claude-opus-5-5',
      timeoutMs: 120_000,
    }),
    logger: createLogger({ level: 'silent', format: 'json' }),
  });
  const resolve = (userRequest: string) =>
    resolver.resolve({ workspaceType: 'personal', userRequest, previous: null });

  it(
    'proyecto + tareas → organize_project con las tareas del usuario; Google Calendar → acción externa; definición → respuesta',
    { timeout: 240_000 },
    async () => {
      const project = await resolve(
        'Crea un proyecto para preparar mi parcial y agrega tres tareas: repasar límites, practicar derivadas y hacer un simulacro.',
      );
      expect(project.mode).toBe('ai');
      expect(['organize_project', 'create_tasks']).toContain(project.intent);
      expect(project.entities.taskTitles).toHaveLength(3);

      const calendar = await resolve('Pon mañana a las 3 una reunión en mi Google Calendar.');
      expect(calendar.intent).toBe('external_action');
      expect(calendar.entities.externalService).toBe('google_calendar');

      const answer = await resolve('¿Qué es una campaña?');
      expect(['creative_advice', 'unknown']).toContain(answer.intent);
    },
  );
});
