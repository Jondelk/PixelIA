import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { AVATAR_MODEL_FILES } from '@pixel/contracts';
import {
  SCULPT_VERSION,
  sculptCharacter,
  type CharacterSpec,
  type RenderView,
  type SculptQuality,
  type SculptResult,
} from '@pixel/sculpt';
import type { SculptJob, SculptWorkerMessage } from './sculpt.worker.js';

/*
 * Ejecuta Pixel Sculpt (packages/sculpt) y escribe los archivos del modelo en una carpeta.
 *
 * El esculpido es cálculo puro (decenas de segundos de CPU), así que corre en un hilo aparte
 * (worker_threads) para no bloquear la API. Si el hilo no puede arrancar, se ejecuta en el hilo
 * principal como respaldo. Este módulo no sabe nada de empresas ni de MongoDB: recibe una
 * especificación y una carpeta, y devuelve los archivos.
 */

export const ENGINE_NAME = 'Pixel Sculpt';
export const ENGINE_VERSION = `pixel-sculpt ${SCULPT_VERSION}`;

export class SculptBuildError extends Error {
  constructor(
    /** Mensaje apto para el usuario. */
    message: string,
    /** Detalle técnico para el log del servidor. */
    readonly detail: string,
  ) {
    super(message);
    this.name = 'SculptBuildError';
  }
}

export interface SculptBuildResult {
  /** Nombres de archivo producidos (subconjunto de AVATAR_MODEL_FILES). */
  files: string[];
  engineVersion: string;
  durationMs: number;
  stats: SculptResult['stats'];
}

export interface SculptRunner {
  build(spec: CharacterSpec, outDir: string): Promise<SculptBuildResult>;
}

export interface SculptRunnerOptions {
  /** Lado de los renders en píxeles. */
  size: number;
  quality: SculptQuality;
  timeoutMs: number;
  /** 'worker' (por defecto): hilo aparte; 'inline': en el hilo principal. */
  mode?: 'worker' | 'inline';
  /** Sustituye al escultor (tests). */
  sculpt?: (job: SculptJob) => Promise<SculptResult>;
}

/** Archivo de cada vista de estudio. */
export const VIEW_FILES: Record<RenderView, string> = {
  hero: AVATAR_MODEL_FILES.hero,
  front: AVATAR_MODEL_FILES.front,
  three_quarter: AVATAR_MODEL_FILES.threeQuarter,
  side: AVATAR_MODEL_FILES.side,
  cutout: AVATAR_MODEL_FILES.cutout,
};

const inline = (job: SculptJob): Promise<SculptResult> =>
  Promise.resolve(sculptCharacter(job.spec, { size: job.size, quality: job.quality }));

/**
 * Arranque del hilo: en desarrollo la API corre con tsx (fuente .ts), así que se registra tsx
 * dentro del hilo antes de importar el módulo del worker. En producción importa el .js compilado.
 */
const BOOT = `
const { workerData, parentPort } = require('node:worker_threads');
(async () => {
  if (workerData.tsx) {
    const { register } = await import(workerData.tsx);
    register();
  }
  await import(workerData.entry);
})().catch((err) =>
  parentPort.postMessage({ ok: false, boot: true, error: String((err && err.stack) || err) }),
);
`;

function workerEntry(): { entry: string; tsx: string | null } {
  const dev = import.meta.url.endsWith('.ts');
  const entry = new URL(dev ? './sculpt.worker.ts' : './sculpt.worker.js', import.meta.url).href;
  if (!dev) return { entry, tsx: null };
  const require = createRequire(import.meta.url);
  return { entry, tsx: pathToFileURL(require.resolve('tsx/esm/api')).href };
}

/** El hilo no pudo arrancar (no es un fallo del modelado). */
class WorkerBootError extends Error {}

function inWorker(job: SculptJob, timeoutMs: number): Promise<SculptResult> {
  return new Promise((resolve, reject) => {
    const { entry, tsx } = workerEntry();
    const worker = new Worker(BOOT, { eval: true, workerData: { entry, tsx, job } });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(() => {
      const seconds = Math.round(timeoutMs / 1000);
      finish(() =>
        reject(
          new SculptBuildError(`El modelado tardó más de ${seconds} s y se detuvo.`, 'timeout'),
        ),
      );
    }, timeoutMs);
    worker.on('message', (message: SculptWorkerMessage) => {
      if (message.ok) finish(() => resolve(message.result));
      else if (message.boot) finish(() => reject(new WorkerBootError(message.error)));
      else
        finish(() =>
          reject(new SculptBuildError('No se pudo esculpir el personaje.', message.error)),
        );
    });
    worker.on('error', (err: Error) =>
      finish(() => reject(new WorkerBootError(err.stack ?? err.message))),
    );
    worker.on('exit', (code) =>
      finish(() =>
        reject(new SculptBuildError('El modelado terminó inesperadamente.', `exit ${code}`)),
      ),
    );
  });
}

export function createSculptRunner(options: SculptRunnerOptions): SculptRunner {
  const run =
    options.sculpt ??
    (options.mode === 'inline'
      ? inline
      : async (job: SculptJob) => {
          try {
            return await inWorker(job, options.timeoutMs);
          } catch (err) {
            if (!(err instanceof WorkerBootError)) throw err;
            // Sin hilos disponibles (entorno restringido): se esculpe en el hilo principal.
            return inline(job);
          }
        });

  return {
    async build(spec, outDir) {
      const started = Date.now();
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8');

      let result: SculptResult;
      try {
        result = await run({ spec, size: options.size, quality: options.quality });
      } catch (err) {
        if (err instanceof SculptBuildError) throw err;
        throw new SculptBuildError(
          'No se pudo esculpir el personaje.',
          err instanceof Error ? (err.stack ?? err.message) : String(err),
        );
      }

      const files: string[] = [];
      await writeFile(join(outDir, AVATAR_MODEL_FILES.glb), result.glb);
      files.push(AVATAR_MODEL_FILES.glb);
      for (const [view, png] of Object.entries(result.renders) as [RenderView, Uint8Array][]) {
        const name = VIEW_FILES[view];
        await writeFile(join(outDir, name), png);
        files.push(name);
      }
      if (!files.includes(AVATAR_MODEL_FILES.hero)) {
        throw new SculptBuildError('El modelado no produjo el render principal.', 'missing hero');
      }
      return {
        files,
        engineVersion: ENGINE_VERSION,
        durationMs: Date.now() - started,
        stats: result.stats,
      };
    },
  };
}
