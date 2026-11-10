import { parentPort, workerData } from 'node:worker_threads';
import {
  sculptCharacter,
  type CharacterSpec,
  type SculptQuality,
  type SculptResult,
} from '@pixel/sculpt';

/* Hilo de esculpido: recibe una especificación y devuelve el .glb y los renders (sin copiar). */

export interface SculptJob {
  spec: CharacterSpec;
  size: number;
  quality: SculptQuality;
}

export type SculptWorkerMessage =
  | { ok: true; result: SculptResult }
  | { ok: false; error: string; boot?: boolean };

const data = workerData as { job?: SculptJob } | null;
if (parentPort && data?.job) {
  const port = parentPort;
  try {
    const { spec, size, quality } = data.job;
    const result = sculptCharacter(spec, { size, quality });
    const transfer = [result.glb.buffer, ...Object.values(result.renders).map((png) => png.buffer)];
    port.postMessage({ ok: true, result } satisfies SculptWorkerMessage, transfer as ArrayBuffer[]);
  } catch (err) {
    port.postMessage({
      ok: false,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    } satisfies SculptWorkerMessage);
  }
}
