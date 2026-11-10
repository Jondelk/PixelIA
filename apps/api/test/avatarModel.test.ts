import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvatarModelResponseSchema } from '@pixel/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAvatarModelService,
  type AvatarModelService,
} from '../src/modules/avatars/model/avatarModel.service.js';
import type { CharacterSpec } from '../src/modules/avatars/model/characterSpec.js';
import {
  ENGINE_VERSION,
  SculptBuildError,
  type SculptRunner,
} from '../src/modules/avatars/model/sculptRunner.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { workspaceIdOf } from './support/workspaces.js';
import { buildTestApp, registerUser, silentLogger, useTestDatabase } from './support/testApp.js';

useTestDatabase();

let storage: string;
beforeAll(async () => {
  storage = await mkdtemp(join(tmpdir(), 'pixel-storage-'));
});
afterAll(async () => {
  await rm(storage, { recursive: true, force: true });
});

/** Escultor simulado: registra las especificaciones y escribe archivos de prueba. */
function fakeRunner(behaviour: { fail?: string } = {}) {
  const specs: CharacterSpec[] = [];
  const runner: SculptRunner = {
    async build(spec, outDir) {
      specs.push(spec);
      if (behaviour.fail) throw new SculptBuildError(behaviour.fail, 'detalle');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(outDir, { recursive: true });
      const files = ['avatar.glb', 'hero.png', 'cutout.png'];
      for (const name of files) await writeFile(join(outDir, name), `contenido de ${name}`);
      const stats = {
        engine: ENGINE_VERSION,
        triangles: 1,
        vertices: 3,
        parts: 1,
        meshMs: 1,
        renderMs: 1,
      };
      return { files, engineVersion: ENGINE_VERSION, durationMs: 1234, stats };
    },
  };
  return { runner, specs };
}

function serviceWith(runner: SculptRunner | null, autoBuild = true): AvatarModelService {
  return createAvatarModelService({ storageDir: storage, runner, autoBuild, logger: silentLogger });
}

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Modelo 3D (Pixel Sculpt)', () => {
  let fake: ReturnType<typeof fakeRunner>;
  let service: AvatarModelService;
  let app: ReturnType<typeof buildTestApp>;
  let owner: Session;
  let companyId: string;
  const url = () => `/api/companies/${companyId}/avatar`;

  beforeEach(async () => {
    fake = fakeRunner();
    service = serviceWith(fake.runner);
    app = buildTestApp(undefined, { avatarModels: service });
    owner = await registerUser(app, 'Ana');
    companyId = await createCompany(owner);
    await completeOnboarding(owner, companyId, cafeTinto);
  });

  it('sin concepto no hay modelo y no se puede construir (409)', async () => {
    const res = await owner.agent.get(`${url()}/model`).expect(200);
    expect(AvatarModelResponseSchema.parse(res.body)).toEqual({
      engine: { name: 'Pixel Sculpt', version: ENGINE_VERSION, available: true },
      model: null,
    });
    const build = await owner.agent.post(`${url()}/model`);
    expect(build.status).toBe(409);
  });

  it('al generar el concepto se construye solo, y sirve los archivos', async () => {
    await owner.agent.post(`${url()}/generate`).expect(201);
    await service.idle();

    expect(fake.specs).toHaveLength(1);
    expect(fake.specs[0]).toMatchObject({ subject: 'coffee_bean', specVersion: 2 });

    const res = await owner.agent.get(`${url()}/model`).expect(200);
    const { model } = AvatarModelResponseSchema.parse(res.body);
    expect(model).toMatchObject({
      avatarVersion: 1,
      status: 'ready',
      engineVersion: ENGINE_VERSION,
      durationMs: 1234,
      error: null,
    });
    // URL canónica por workspace (la empresa vive en su workspace enterprise).
    const workspaceId = (await workspaceIdOf(companyId)).toString();
    expect(model!.files.glb).toMatch(
      new RegExp(`^/api/workspaces/${workspaceId}/avatar/model/files/avatar\\.glb\\?b=`),
    );
    // La misma API responde por la ruta de workspace y por la legacy de empresa.
    const byWorkspace = await owner.agent
      .get(`/api/workspaces/${workspaceId}/avatar/model`)
      .expect(200);
    expect(byWorkspace.body.model.status).toBe('ready');
    expect(model!.files.front).toBeNull();

    const glb = await owner.agent.get(model!.files.glb!).expect(200);
    expect(glb.headers['cache-control']).toContain('immutable');
    const download = await owner.agent.get(`${model!.files.glb!}&download=1`).expect(200);
    expect(download.headers['content-disposition']).toContain('avatar.glb');
  });

  it('no vuelve a construir lo que ya está listo, salvo que se fuerce', async () => {
    await owner.agent.post(`${url()}/generate`).expect(201);
    await service.idle();
    const first = (await owner.agent.get(`${url()}/model`)).body.model.files.glb as string;

    await owner.agent.post(`${url()}/model`).expect(202);
    await service.idle();
    expect(fake.specs).toHaveLength(1);

    const forced = await owner.agent.post(`${url()}/model?force=true`).expect(202);
    expect(['queued', 'building']).toContain(forced.body.model.status);
    await service.idle();
    expect(fake.specs).toHaveLength(2);
    const second = (await owner.agent.get(`${url()}/model`)).body.model.files.glb as string;
    expect(second).not.toBe(first);
  });

  it('solo sirve nombres conocidos', async () => {
    await owner.agent.post(`${url()}/generate`).expect(201);
    await service.idle();
    await owner.agent.get(`${url()}/model/files/spec.json`).expect(404);
    await owner.agent.get(`${url()}/model/files/front.png`).expect(404);
    await owner.agent.get(`${url()}/model/files/..%2F..%2Fpackage.json`).expect(404);
  });

  it('otra persona no ve el modelo ni sus archivos (404)', async () => {
    await owner.agent.post(`${url()}/generate`).expect(201);
    await service.idle();
    const glb = (await owner.agent.get(`${url()}/model`)).body.model.files.glb as string;

    const intruder = await registerUser(app, 'Intrusa');
    await intruder.agent.get(`${url()}/model`).expect(404);
    await intruder.agent.post(`${url()}/model`).expect(404);
    await intruder.agent.get(glb).expect(404);
  });

  it('si el esculpido falla, explica el motivo', async () => {
    const failing = fakeRunner({ fail: 'El modelado tardó más de 300 s y se detuvo.' });
    const failingService = serviceWith(failing.runner);
    const failingApp = buildTestApp(undefined, { avatarModels: failingService });
    const session = await registerUser(failingApp, 'Leo');
    const id = await createCompany(session);
    await completeOnboarding(session, id, cafeTinto);

    await session.agent.post(`/api/companies/${id}/avatar/generate`).expect(201);
    await failingService.idle();
    const res = await session.agent.get(`/api/companies/${id}/avatar/model`).expect(200);
    expect(res.body.model).toMatchObject({
      status: 'failed',
      error: 'El modelado tardó más de 300 s y se detuvo.',
      files: { glb: null },
    });
  });
});

describe('Producción 3D desactivada', () => {
  it('la API lo informa y responde 503 al pedir una construcción', async () => {
    const service = serviceWith(null);
    const app = buildTestApp(undefined, { avatarModels: service });
    const owner = await registerUser(app, 'Sol');
    const companyId = await createCompany(owner);
    await completeOnboarding(owner, companyId, cafeTinto);
    await owner.agent.post(`/api/companies/${companyId}/avatar/generate`).expect(201);
    await service.idle();

    const res = await owner.agent.get(`/api/companies/${companyId}/avatar/model`).expect(200);
    expect(res.body).toEqual({
      engine: { name: 'Pixel Sculpt', version: ENGINE_VERSION, available: false },
      model: null,
    });

    const build = await owner.agent.post(`/api/companies/${companyId}/avatar/model`);
    expect(build.status).toBe(503);
    expect(build.body.error.message).toContain('desactivada');
  });
});
