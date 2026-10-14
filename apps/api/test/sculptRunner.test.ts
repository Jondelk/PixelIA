import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGlbJson } from '@pixel/sculpt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { profileToCharacterSpec } from '../src/modules/avatars/model/characterSpec.js';
import {
  createSculptRunner,
  ENGINE_VERSION,
  SculptBuildError,
} from '../src/modules/avatars/model/sculptRunner.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { avatarFor, brandDnaFor } from './support/dna.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pixel-sculpt-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cafeSpec = async () => profileToCharacterSpec(await avatarFor(brandDnaFor(cafeTinto)));

describe('Pixel Sculpt en la API', () => {
  it('esculpe la marca y escribe el .glb animable y los renders de estudio', async () => {
    const runner = createSculptRunner({
      size: 96,
      quality: 'draft',
      timeoutMs: 120_000,
      mode: 'inline',
    });
    const result = await runner.build(await cafeSpec(), dir);

    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.files).toEqual(
      expect.arrayContaining([
        'avatar.glb',
        'hero.png',
        'front.png',
        'three_quarter.png',
        'side.png',
        'cutout.png',
      ]),
    );
    expect(result.stats.triangles).toBeGreaterThan(10_000);
    expect((await readdir(dir)).sort()).toEqual([...result.files, 'spec.json'].sort());

    const glb = new Uint8Array(await readFile(join(dir, 'avatar.glb')));
    const { json } = readGlbJson(glb);
    const names = (json.nodes as { name: string }[]).map((node) => node.name);
    for (const rig of [
      'PixelRoot',
      'Face',
      'Eye_L',
      'Eye_R',
      'Pupil_L',
      'Pupil_R',
      'Mouth',
      'Arm_L',
      'Arm_R',
      'Leg_L',
      'Leg_R',
    ]) {
      expect(names).toContain(rig);
    }
    const hero = await readFile(join(dir, 'hero.png'));
    expect([...hero.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  }, 120_000);

  it('corre en un hilo aparte sin bloquear la API', async () => {
    const runner = createSculptRunner({ size: 64, quality: 'draft', timeoutMs: 120_000 });
    let ticks = 0;
    const timer = setInterval(() => ticks++, 20);
    try {
      const result = await runner.build(await cafeSpec(), dir);
      expect(result.files).toContain('avatar.glb');
    } finally {
      clearInterval(timer);
    }
    // El bucle de eventos siguió atendiendo mientras se esculpía.
    expect(ticks).toBeGreaterThan(5);
  }, 120_000);

  it('un fallo del escultor llega como mensaje apto para el usuario', async () => {
    const runner = createSculptRunner({
      size: 64,
      quality: 'draft',
      timeoutMs: 1000,
      sculpt: () => Promise.reject(new Error('sin memoria')),
    });
    const error = await runner.build(await cafeSpec(), dir).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SculptBuildError);
    expect((error as SculptBuildError).message).toBe('No se pudo esculpir el personaje.');
    expect((error as SculptBuildError).detail).toContain('sin memoria');
  });
});
