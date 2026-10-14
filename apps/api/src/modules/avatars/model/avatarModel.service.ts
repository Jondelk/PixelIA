import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AVATAR_MODEL_FILES,
  AvatarModelFileNameSchema,
  type AvatarModel,
  type AvatarModelResponse,
} from '@pixel/contracts';
import type { Types } from 'mongoose';
import { AppError, conflict, notFound } from '../../../lib/errors.js';
import type { Logger } from '../../../lib/logger.js';
import type { WorkspaceDocument } from '../../workspaces/workspace.model.js';
import { AvatarProfileModel, toAvatarProfileDTO } from '../avatarProfile.model.js';
import { AvatarBuildModel, type AvatarBuildDocument } from './avatarBuild.model.js';
import { profileToCharacterSpec } from './characterSpec.js';
import {
  ENGINE_NAME,
  ENGINE_VERSION,
  SculptBuildError,
  type SculptRunner,
} from './sculptRunner.js';

/*
 * Producción 3D del personaje con Pixel Sculpt (motor propio, sin programas externos).
 *
 * - Una construcción por workspace y versión del AvatarProfile (colección avatar_builds, aislada
 *   por workspaceId con tenantScoped, igual que el AvatarProfile). Sirve a los dos tipos de
 *   workspace: Enterprise (personaje de la marca) y Personal (personaje de la persona).
 *   el personaje sale del BrandDNA de la empresa del workspace.
 * - Cola en proceso con una sola construcción a la vez: el esculpido usa un núcleo completo
 *   durante decenas de segundos y el MVP no añade colas externas (ver CLAUDE.md). Si la API se reinicia, una construcción que quedó a
 *   medias se marca como fallida la próxima vez que se consulta.
 * - Los archivos se escriben en una carpeta temporal y solo reemplazan a los anteriores si la
 *   construcción termina bien: un fallo nunca deja al personaje sin modelo.
 */

/**
 * Workspace ya autorizado y versión vigente de su avatar: company.avatarVersion en Enterprise,
 * personalProfile.avatarVersion en Personal (la resuelve la ruta).
 */
export interface ModelScope {
  workspace: WorkspaceDocument;
  avatarVersion: number | null;
  /** Empresa del workspace (referencia en Enterprise); null en Personal. */
  companyId: Types.ObjectId | null;
}

export interface AvatarModelService {
  readonly autoBuild: boolean;
  /** Estado del modelo de la versión vigente del avatar. */
  get(scope: ModelScope): Promise<AvatarModelResponse>;
  /** Pide construir (o reconstruir con force) la versión vigente. */
  request(scope: ModelScope, options?: { force?: boolean }): Promise<AvatarModelResponse>;
  /** Encola una versión concreta; no lanza si la producción 3D está desactivada. */
  enqueueQuietly(scope: ModelScope, avatarVersion: number): Promise<void>;
  /** Ruta absoluta de un archivo del modelo vigente, o 404. */
  filePath(scope: ModelScope, fileName: string): Promise<string>;
  /** Espera a que la cola quede vacía (tests y apagado). */
  idle(): Promise<void>;
}

export interface AvatarModelServiceOptions {
  storageDir: string;
  /** Escultor; null desactiva la producción 3D (la web usa el avatar paramétrico). */
  runner: SculptRunner | null;
  autoBuild: boolean;
  logger: Logger;
}

const INTERRUPTED =
  'La construcción se interrumpió porque la API se reinició. Vuelve a intentarlo.';

const serviceUnavailable = (message: string) => new AppError(503, 'SERVICE_UNAVAILABLE', message);

export function createAvatarModelService(options: AvatarModelServiceOptions): AvatarModelService {
  const root = resolve(options.storageDir);
  const pending = new Set<string>();
  const enqueuing = new Set<Promise<void>>();
  let tail: Promise<void> = Promise.resolve();

  const runner = options.runner;

  const keyOf = (workspaceId: Types.ObjectId, version: number) =>
    `${workspaceId.toString()}:${version}`;
  const dirOf = (workspaceId: Types.ObjectId, version: number) =>
    join(root, 'avatars', workspaceId.toString(), `v${version}`);

  /** URL canónica por workspace (pasa por requireWorkspaceAccess); cambia en cada construcción. */
  function fileUrl(doc: AvatarBuildDocument, name: string) {
    if (!doc.files.includes(name)) return null;
    const base = `/api/workspaces/${doc.workspaceId.toString()}/avatar/model/files`;
    return `${base}/${name}?b=${doc.buildId}`;
  }

  function toModel(doc: AvatarBuildDocument): AvatarModel {
    const url = (name: string) => fileUrl(doc, name);
    return {
      avatarVersion: doc.avatarVersion,
      status: doc.status,
      engineVersion: doc.engineVersion,
      files: {
        glb: url(AVATAR_MODEL_FILES.glb),
        hero: url(AVATAR_MODEL_FILES.hero),
        front: url(AVATAR_MODEL_FILES.front),
        threeQuarter: url(AVATAR_MODEL_FILES.threeQuarter),
        side: url(AVATAR_MODEL_FILES.side),
        cutout: url(AVATAR_MODEL_FILES.cutout),
      },
      error: doc.error,
      startedAt: doc.startedAt?.toISOString() ?? null,
      finishedAt: doc.finishedAt?.toISOString() ?? null,
      durationMs: doc.durationMs,
    };
  }

  async function findBuild(workspaceId: Types.ObjectId, avatarVersion: number) {
    const doc = await AvatarBuildModel.findOne({ workspaceId, avatarVersion });
    // Quedó "en curso" pero ya no está en la cola de este proceso: la API se reinició.
    if (
      doc &&
      (doc.status === 'queued' || doc.status === 'building') &&
      !pending.has(keyOf(workspaceId, avatarVersion))
    ) {
      doc.status = 'failed';
      doc.error = INTERRUPTED;
      doc.finishedAt = new Date();
      await AvatarBuildModel.updateOne(
        { workspaceId, avatarVersion, buildId: doc.buildId },
        { $set: { status: 'failed', error: INTERRUPTED, finishedAt: doc.finishedAt } },
      );
    }
    return doc;
  }

  async function run(workspaceId: Types.ObjectId, avatarVersion: number, buildId: string) {
    const filter = { workspaceId, avatarVersion, buildId };
    const fail = (error: string) =>
      AvatarBuildModel.updateOne(filter, {
        $set: { status: 'failed', error, finishedAt: new Date() },
      });

    const finalDir = dirOf(workspaceId, avatarVersion);
    const workDir = `${finalDir}.build-${buildId.slice(0, 8)}`;
    try {
      if (!runner) {
        await fail('La producción 3D está desactivada en el servidor.');
        return;
      }
      await AvatarBuildModel.updateOne(filter, {
        $set: { status: 'building', startedAt: new Date(), error: null },
      });
      const profileDoc = await AvatarProfileModel.findOne({ workspaceId, version: avatarVersion });
      if (!profileDoc) {
        await fail('El concepto del personaje ya no existe.');
        return;
      }

      const spec = profileToCharacterSpec(toAvatarProfileDTO(profileDoc));
      await rm(workDir, { recursive: true, force: true });
      const result = await runner.build(spec, workDir);

      await rm(finalDir, { recursive: true, force: true });
      await rename(workDir, finalDir);
      await AvatarBuildModel.updateOne(filter, {
        $set: {
          status: 'ready',
          files: result.files,
          engineVersion: result.engineVersion,
          error: null,
          finishedAt: new Date(),
          durationMs: result.durationMs,
        },
      });
      options.logger.info('Personaje esculpido en 3D', {
        workspaceId: workspaceId.toString(),
        avatarVersion,
        durationMs: result.durationMs,
        triangles: result.stats.triangles,
      });
    } catch (err) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      const message =
        err instanceof SculptBuildError ? err.message : 'No se pudo construir el modelo 3D.';
      options.logger.error('Falló el esculpido del personaje', {
        workspaceId: workspaceId.toString(),
        avatarVersion,
        err,
        detail: err instanceof SculptBuildError ? err.detail : undefined,
      });
      await fail(message).catch(() => undefined);
    }
  }

  async function enqueue(scope: ModelScope, avatarVersion: number, force: boolean) {
    if (!runner) throw serviceUnavailable('La producción 3D está desactivada en el servidor.');
    const workspaceId = scope.workspace._id;

    const key = keyOf(workspaceId, avatarVersion);
    if (pending.has(key)) return;
    const existing = await findBuild(workspaceId, avatarVersion);
    if (existing?.status === 'ready' && !force) return;
    // Comprobación repetida tras el await: otra petición pudo encolarla mientras tanto.
    if (pending.has(key)) return;
    pending.add(key);

    const buildId = randomUUID();
    try {
      await AvatarBuildModel.findOneAndUpdate(
        { workspaceId, avatarVersion },
        {
          $set: { status: 'queued', buildId, error: null, startedAt: null, finishedAt: null },
          $setOnInsert: {
            companyId: scope.companyId,
            files: [],
            engineVersion: null,
            durationMs: null,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      pending.delete(key);
      throw err;
    }
    tail = tail
      .then(() => run(workspaceId, avatarVersion, buildId))
      .catch((err: unknown) => options.logger.error('Error en la cola de modelado 3D', { err }))
      .finally(() => pending.delete(key));
  }

  async function get(scope: ModelScope): Promise<AvatarModelResponse> {
    let doc = scope.avatarVersion
      ? await findBuild(scope.workspace._id, scope.avatarVersion)
      : null;
    // Un modelo hecho con una versión anterior del motor se vuelve a esculpir solo (mejoras como
    // la boca animable llegan sin que nadie tenga que pedirlo). Mientras tanto se sirve el anterior.
    if (
      doc?.status === 'ready' &&
      doc.engineVersion !== ENGINE_VERSION &&
      options.autoBuild &&
      runner &&
      scope.avatarVersion
    ) {
      await enqueue(scope, scope.avatarVersion, true).catch((err: unknown) =>
        options.logger.error('No se pudo actualizar el modelo 3D', { err }),
      );
      doc = await findBuild(scope.workspace._id, scope.avatarVersion);
    }
    return {
      engine: { name: ENGINE_NAME, version: ENGINE_VERSION, available: runner !== null },
      model: doc ? toModel(doc) : null,
    };
  }

  return {
    autoBuild: options.autoBuild,
    get,

    async request(scope, { force = false } = {}) {
      const version = scope.avatarVersion;
      if (!version) throw conflict('Primero crea el concepto del personaje');
      await enqueue(scope, version, force);
      return get(scope);
    },

    async enqueueQuietly(scope, avatarVersion) {
      const task = enqueue(scope, avatarVersion, false).catch((err: unknown) => {
        if (!(err instanceof AppError)) {
          options.logger.error('No se pudo encolar el modelado 3D', { err });
        }
      });
      enqueuing.add(task);
      await task.finally(() => enqueuing.delete(task));
    },

    async filePath(scope, fileName) {
      const { workspace, avatarVersion } = scope;
      const name = AvatarModelFileNameSchema.safeParse(fileName);
      if (!name.success || !avatarVersion) throw notFound('Archivo no encontrado');
      const doc = await AvatarBuildModel.findOne({
        workspaceId: workspace._id,
        avatarVersion,
      });
      const path = join(dirOf(workspace._id, avatarVersion), name.data);
      if (!doc?.files.includes(name.data) || !existsSync(path)) {
        throw notFound('Archivo no encontrado');
      }
      return path;
    },

    async idle() {
      // Primero las peticiones que aún se están encolando; luego la cola misma.
      while (enqueuing.size) await Promise.all([...enqueuing]);
      let current: Promise<void>;
      do {
        current = tail;
        await current;
      } while (current !== tail);
    },
  };
}

/** Servicio para cuando no se configuró producción 3D (tests de otros módulos). */
export function createDisabledAvatarModelService(logger: Logger): AvatarModelService {
  return createAvatarModelService({
    storageDir: 'storage',
    runner: null,
    autoBuild: false,
    logger,
  });
}
