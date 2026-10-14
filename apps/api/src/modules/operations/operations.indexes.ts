import { ProjectModel } from './project.model.js';
import { TaskModel } from './task.model.js';

/*
 * Índices de idempotencia de las acciones de Pixel (Prompt 18, docs/PIXEL-ACTIONS.md §8). La
 * garantía de «una acción = un recurso» ante una carrera depende de ellos, así que NO se deja al
 * `autoIndex` de Mongoose: se crean de forma explícita en `migrate:workspaces` y al arrancar la API,
 * donde son mantenimiento CRÍTICO: si no quedan bien, la API no queda operativa (fail closed).
 *
 * `createIndexes` es idempotente y reiniciable: crea lo declarado que falta, no toca lo que ya
 * existe y nunca modifica ni borra documentos. El índice es parcial (solo con `pixelActionKey`
 * de tipo texto), así que los proyectos y tareas creados a mano o anteriores (sin clave) no entran
 * y se construye sin conflictos.
 */

export const ACTION_KEY_INDEX = 'workspace_pixel_action_key_unique';
const ACTION_KEY_MODELS = [ProjectModel, TaskModel] as const;
const EXPECTED_KEY = JSON.stringify({ workspaceId: 1, pixelActionKey: 1 });
const EXPECTED_PARTIAL = JSON.stringify({ pixelActionKey: { $type: 'string' } });

type IndexInfo = Awaited<ReturnType<typeof ProjectModel.collection.indexes>>[number];

const isExpected = (index: IndexInfo | undefined) =>
  index?.unique === true &&
  JSON.stringify(index.key) === EXPECTED_KEY &&
  JSON.stringify(index.partialFilterExpression) === EXPECTED_PARTIAL;

async function actionKeyIndexOf(model: (typeof ACTION_KEY_MODELS)[number]) {
  const indexes = await model.collection.indexes().catch(() => []);
  return indexes.find((index) => index.name === ACTION_KEY_INDEX);
}

/** Colecciones cuyo índice de idempotencia falta o no es exactamente el esperado. */
export async function missingActionKeyIndexes(): Promise<string[]> {
  const missing: string[] = [];
  for (const model of ACTION_KEY_MODELS) {
    if (!isExpected(await actionKeyIndexOf(model))) missing.push(model.collection.collectionName);
  }
  return missing;
}

/** Fallo que deja la API sin la garantía de idempotencia de Action Foundation. */
export class ActionKeyIndexError extends Error {
  constructor(
    readonly collection: string,
    reason: string,
  ) {
    super(
      `Índice ${ACTION_KEY_INDEX} no disponible en «${collection}» (${reason}): la API no puede garantizar la idempotencia de las acciones de Pixel (Action Foundation)`,
    );
    this.name = 'ActionKeyIndexError';
  }
}

/**
 * Crea (si faltan) los índices declarados de Project y Task y comprueba los de idempotencia.
 * Si existe un índice con ESE nombre pero otra configuración, se repara: se elimina solo el índice
 * (nunca datos) y se vuelve a crear con la declarada. Si aun así no queda bien (p. ej. datos que ya
 * violan la unicidad), lanza ActionKeyIndexError. Devuelve las colecciones reparadas.
 */
export async function ensureActionKeyIndexes(): Promise<string[]> {
  const repaired: string[] = [];
  for (const model of ACTION_KEY_MODELS) {
    const collection = model.collection.collectionName;
    const current = await actionKeyIndexOf(model);
    if (current && !isExpected(current)) {
      await model.collection.dropIndex(ACTION_KEY_INDEX);
      repaired.push(collection);
    }
    try {
      await model.createIndexes();
    } catch (err) {
      throw new ActionKeyIndexError(
        collection,
        err instanceof Error ? err.message.slice(0, 200) : 'no se pudo crear',
      );
    }
    if (!isExpected(await actionKeyIndexOf(model))) {
      throw new ActionKeyIndexError(
        collection,
        'no coincide con { workspaceId, pixelActionKey } único y parcial',
      );
    }
  }
  return repaired;
}
