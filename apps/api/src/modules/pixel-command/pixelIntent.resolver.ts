import {
  availablePixelIntents,
  GeneratedPixelInterpretationSchema,
  PixelCommandEntitiesSchema,
  type ContentFormat,
  type ContentPlatform,
  type PixelCommandEntities,
  type PixelCommandIntent,
  type WorkspaceType,
} from '@pixel/contracts';
import {
  fold,
  interpretPixelRequest,
  PIXEL_COMMAND_SCHEMA_NAME,
  PIXEL_COMMAND_SYSTEM,
  pixelCommandPrompt,
  type AIProvider,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';

/*
 * PixelIntentResolver (docs/PIXEL-COMMAND.md §2). La IA (o, en modo demo y como respaldo si falla,
 * las reglas) solo interpreta el lenguaje. El backend decide lo demás:
 * - la intención debe existir para el tipo de workspace (capacidades de contracts);
 * - las entidades de texto deben estar en lo que el usuario escribió (lo inventado se descarta);
 * - un ajuste o una respuesta se MEZCLA con lo anterior de forma determinista.
 */

export interface ResolvedInterpretation {
  intent: PixelCommandIntent;
  confidence: number;
  entities: PixelCommandEntities;
  mode: 'ai' | 'demo' | 'rules';
}

export interface PreviousInterpretation {
  intent: PixelCommandIntent;
  request: string;
  entities: PixelCommandEntities;
}

const KEY_WORD = /[a-z0-9ñ]+/g;
const keyWords = (text: string) =>
  (fold(text).match(KEY_WORD) ?? []).filter((word) => word.length >= 3 || /\d/.test(word));

/** ¿El texto extraído está en lo que escribió el usuario? (al menos la mitad de sus palabras). */
function grounded(value: string | null, source: string): string | null {
  if (!value) return null;
  const words = keyWords(value);
  if (words.length === 0) return null;
  const available = new Set(keyWords(source));
  const present = words.filter((word) => available.has(word)).length;
  return present * 2 >= words.length ? value : null;
}

function sanitizeEntities(entities: PixelCommandEntities, source: string): PixelCommandEntities {
  return PixelCommandEntitiesSchema.parse({
    ...entities,
    productOrService: grounded(entities.productOrService, source),
    objective: grounded(entities.objective, source),
    campaignHint: grounded(entities.campaignHint, source),
    projectHint: grounded(entities.projectHint, source),
    topic: grounded(entities.topic, source),
    memoryText: grounded(entities.memoryText, source),
    taskTitles: entities.taskTitles.filter((title) => grounded(title, source)),
  });
}

const unique = <T>(values: T[]) => [...new Set(values)];

/** Mezcla determinista: lo nuevo manda; las exclusiones se acumulan; reincluir quita la exclusión. */
export function mergeEntities(
  previous: PixelCommandEntities,
  next: PixelCommandEntities,
): PixelCommandEntities {
  const excludedPlatforms = unique([
    ...previous.excludedPlatforms.filter((value) => !next.platforms.includes(value)),
    ...next.excludedPlatforms,
  ]);
  const excludedFormats = unique([
    ...previous.excludedFormats.filter((value) => !next.formats.includes(value)),
    ...next.excludedFormats,
  ]);
  const platforms = (next.platforms.length ? next.platforms : previous.platforms).filter(
    (value: ContentPlatform) => !excludedPlatforms.includes(value),
  );
  const formats = (next.formats.length ? next.formats : previous.formats).filter(
    (value: ContentFormat) => !excludedFormats.includes(value),
  );
  return PixelCommandEntitiesSchema.parse({
    productOrService: next.productOrService ?? previous.productOrService,
    objective: next.objective ?? previous.objective,
    campaignType: next.campaignType ?? previous.campaignType,
    timeframe: next.timeframe ?? previous.timeframe,
    platforms,
    excludedPlatforms,
    formats,
    excludedFormats,
    pieceCount: next.pieceCount ?? previous.pieceCount,
    campaignHint: next.campaignHint ?? previous.campaignHint,
    projectHint: next.projectHint ?? previous.projectHint,
    topic: next.topic ?? previous.topic,
    taskTitles: unique([...previous.taskTitles, ...next.taskTitles]).slice(0, 20),
    includeContent: previous.includeContent || next.includeContent,
    memoryAction: next.memoryAction ?? previous.memoryAction,
    memoryText: previous.memoryText ?? next.memoryText,
    memoryScopeHint: next.memoryScopeHint ?? previous.memoryScopeHint,
  });
}

export interface PixelIntentResolver {
  resolve(input: {
    workspaceType: WorkspaceType;
    userRequest: string;
    previous: PreviousInterpretation | null;
  }): Promise<ResolvedInterpretation>;
}

export function createPixelIntentResolver(deps: {
  ai: AIProvider;
  logger: Logger;
}): PixelIntentResolver {
  return {
    async resolve({ workspaceType, userRequest, previous }) {
      const availableIntents = availablePixelIntents(workspaceType);
      let raw;
      let mode: ResolvedInterpretation['mode'];
      try {
        const result = await deps.ai.generateStructuredOutput({
          system: PIXEL_COMMAND_SYSTEM,
          prompt: pixelCommandPrompt({ workspaceType, availableIntents, userRequest, previous }),
          schema: GeneratedPixelInterpretationSchema,
          schemaName: PIXEL_COMMAND_SCHEMA_NAME,
          maxOutputTokens: 1500,
          effort: 'low',
        });
        // Doble validación: el proveedor ya aplicó el schema.
        raw = GeneratedPixelInterpretationSchema.parse(result.data);
        mode = result.mode;
      } catch (err) {
        deps.logger.warn('PixelCommand: el intérprete de IA falló; se usan las reglas', { err });
        raw = interpretPixelRequest(userRequest, availableIntents);
        mode = 'rules';
      }

      // La intención debe existir para este tipo (Personal nunca crea campañas).
      let intent: PixelCommandIntent = raw.intent;
      if (intent === 'create_campaign' && !availableIntents.includes('create_campaign')) {
        intent = 'plan_content';
      }
      if (!availableIntents.includes(intent)) intent = 'unknown';

      const source = previous ? `${previous.request}\n${userRequest}` : userRequest;
      let entities = sanitizeEntities(raw.entities, source);
      if (previous) {
        entities = mergeEntities(previous.entities, entities);
        // Un ajuste refina la solicitud: conserva su intención salvo que no se supiera cuál era.
        if (previous.intent !== 'unknown') intent = previous.intent;
      }
      return { intent, confidence: raw.confidence, entities, mode };
    },
  };
}
