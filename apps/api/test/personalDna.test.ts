import { PersonalDnaResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { BrandDnaModel } from '../src/modules/brand-dna/brandDna.model.js';
import { PersonalDnaModel } from '../src/modules/personal/personalDna.model.js';
import { PersonalProfileModel } from '../src/modules/personal/personalProfile.model.js';
import { photographer, streamer } from './fixtures/personal.js';
import {
  completePersonalOnboarding,
  createPersonalWorkspace,
  savePersonalStep,
} from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('PersonalDNA: generación y versiones', () => {
  let jhon: Session;
  let workspaceId: string;
  const url = (path = '') => `/api/workspaces/${workspaceId}/personal-dna${path}`;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await createPersonalWorkspace(jhon);
  });

  it('sin onboarding completo no hay ADN y no se puede generar (409)', async () => {
    const res = await jhon.agent.get(url()).expect(200);
    expect(PersonalDnaResponseSchema.parse(res.body)).toEqual({
      personalDna: null,
      completeness: null,
    });
    await savePersonalStep(jhon, workspaceId, 'identity', photographer).expect(200);
    const generate = await jhon.agent.post(url('/generate')).expect(409);
    expect(generate.body.error.code).toBe('CONFLICT');
    await jhon.agent
      .put(url())
      .send({ preferences: ['algo'] })
      .expect(409);
  });

  it('genera un ADN estructurado solo con las respuestas reales (sin inventar)', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    const res = await jhon.agent.get(url()).expect(200);
    const { personalDna, completeness } = PersonalDnaResponseSchema.parse(res.body);

    expect(personalDna).toMatchObject({
      workspaceId,
      version: 1,
      generator: { kind: 'deterministic', version: 'personal-rules-1' },
      identity: {
        name: 'Valeria Mora',
        professionalIdentity: ['Fotógrafa de retrato', 'fotógrafa', 'directora de arte'],
        summary: 'Retratos editoriales con luz natural',
      },
      goals: { professional: ['vender sesiones premium'], personal: [] },
      personality: { traits: ['minimalista', 'serena', 'editorial'] },
      communication: { formality: 4, energy: 2, language: 'es' },
      creativeIdentity: {
        colors: [
          { hex: '#F2EFE9', name: 'Marfil' },
          { hex: '#1C1C1C', name: 'Carbón' },
        ],
      },
      contentIdentity: { platforms: ['Instagram', 'LinkedIn'] },
      supportNeeds: { wantsHelpWith: ['contenido', 'marca personal', 'clientes'] },
    });
    // Lo que nadie respondió queda vacío.
    expect(personalDna!.professionalProfile.industries).toEqual([]);
    expect(personalDna!.professionalProfile.strengths).toEqual([]);
    expect(personalDna!.personality.archetypes.length).toBeGreaterThan(0);
    expect(personalDna!.restrictions).toEqual([
      'Evitar visualmente: filtros saturados',
      'Evitar visualmente: collages recargados',
      'No usar «barato»',
      'No usar «promo»',
    ]);
    expect(completeness).toMatchObject({ total: 11 });
    expect(completeness!.percent).toBeGreaterThan(80);
  });

  it('las mismas respuestas no crean versiones nuevas; un cambio sí', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    await savePersonalStep(jhon, workspaceId, 'goals', photographer).expect(200);
    await jhon.agent.post(url('/generate')).expect(200);
    expect(await PersonalDnaModel.countDocuments({ workspaceId })).toBe(1);

    await savePersonalStep(jhon, workspaceId, 'personality', streamer).expect(200);
    const res = await jhon.agent.get(url()).expect(200);
    expect(res.body.personalDna).toMatchObject({
      version: 2,
      personality: { traits: ['energético', 'divertido', 'colorido'] },
    });
  });

  it('PUT corrige secciones creando una versión manual que se conserva', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    const current = (await jhon.agent.get(url()).expect(200)).body.personalDna;

    const edited = await jhon.agent
      .put(url())
      .send({
        identity: { ...current.identity, summary: 'Fotógrafa editorial de retratos premium.' },
      })
      .expect(200);
    expect(edited.body.personalDna).toMatchObject({
      version: 2,
      generator: { kind: 'manual' },
      identity: { summary: 'Fotógrafa editorial de retratos premium.' },
      // El resto del ADN no cambia.
      goals: current.goals,
    });

    // Volver a guardar las mismas respuestas no pisa la edición manual…
    await savePersonalStep(jhon, workspaceId, 'support', photographer).expect(200);
    expect((await jhon.agent.get(url()).expect(200)).body.personalDna.version).toBe(2);
    // …pero "regenerar" vuelve a construirlo desde las respuestas (versión nueva, historial intacto).
    const regenerated = await jhon.agent.post(url('/generate')).expect(200);
    expect(regenerated.body.personalDna).toMatchObject({
      version: 3,
      generator: { kind: 'deterministic' },
      identity: { summary: 'Retratos editoriales con luz natural' },
    });
    expect(await PersonalDnaModel.countDocuments({ workspaceId })).toBe(3);
  });

  it('una corrección manual sobrevive cuando cambian otras respuestas', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    const current = (await jhon.agent.get(url()).expect(200)).body.personalDna;
    await jhon.agent
      .put(url())
      .send({ identity: { ...current.identity, summary: 'Retrato editorial premium.' } })
      .expect(200);

    await savePersonalStep(jhon, workspaceId, 'goals', {
      ...photographer,
      goals: { ...photographer.goals!, professional: ['vender sesiones premium', 'dar talleres'] },
    }).expect(200);
    const res = await jhon.agent.get(url()).expect(200);
    expect(res.body.personalDna).toMatchObject({
      version: 3,
      generator: { kind: 'manual' },
      identity: { summary: 'Retrato editorial premium.' },
      goals: { professional: ['vender sesiones premium', 'dar talleres'] },
    });

    // "Regenerar desde mis respuestas" descarta la corrección.
    const regenerated = await jhon.agent.post(url('/generate')).expect(200);
    expect(regenerated.body.personalDna).toMatchObject({
      version: 4,
      generator: { kind: 'deterministic' },
      identity: { summary: 'Retratos editoriales con luz natural' },
    });
  });

  it('guardados idénticos a la vez no duplican versiones', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    await PersonalDnaModel.deleteMany({ workspaceId });
    await PersonalProfileModel.updateOne({ workspaceId }, { $set: { personalDnaVersion: null } });
    await Promise.all(
      [1, 2, 3, 4].map(() =>
        savePersonalStep(jhon, workspaceId, 'support', photographer).expect(200),
      ),
    );
    expect(await PersonalDnaModel.countDocuments({ workspaceId })).toBe(1);
    expect((await jhon.agent.get(url()).expect(200)).body.personalDna.version).toBe(1);
  });

  it('PUT valida con el schema del ADN (400) y rechaza secciones desconocidas', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    await jhon.agent.put(url()).send({}).expect(400);
    await jhon.agent.put(url()).send({ tasks: [] }).expect(400);
    await jhon.agent
      .put(url())
      .send({ communication: { tone: [], formality: 9, energy: 1, language: 'es' } })
      .expect(400);
  });
});

describe('PersonalDNA: aislamiento', () => {
  it('otro usuario no puede leer, editar ni regenerar el ADN ajeno (404)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const aliceWs = await createPersonalWorkspace(alice, 'Alice');
    await completePersonalOnboarding(alice, aliceWs, photographer);

    const read = await bob.agent.get(`/api/workspaces/${aliceWs}/personal-dna`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('Valeria');
    await bob.agent.post(`/api/workspaces/${aliceWs}/personal-dna/generate`).expect(404);
    await bob.agent
      .put(`/api/workspaces/${aliceWs}/personal-dna`)
      .send({ preferences: ['x'] })
      .expect(404);
    expect(await PersonalDnaModel.countDocuments({ workspaceId: aliceWs })).toBe(1);
  });

  it('el PersonalDNA no usa BrandDNA y se filtra siempre por workspaceId', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, ws, streamer);
    expect(await BrandDnaModel.collection.countDocuments({})).toBe(0);
    await expect(PersonalDnaModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(PersonalDnaModel.findOne({ workspaceId: { $ne: ws } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
  });
});

describe('PersonalDNA: regenerar con IA', () => {
  /** Proveedor "real" que falla la primera vez y después propone una fortaleza verificable. */
  class FlakyAi implements AIProvider {
    readonly name = 'flaky';
    readonly model = 'flaky-1';
    readonly mode = 'ai' as const;
    calls = 0;
    generateText(): never {
      throw new Error('no usado');
    }
    async generateStructuredOutput<T>() {
      this.calls += 1;
      if (this.calls === 1) throw new Error('timeout');
      return {
        data: { summary: null, strengths: ['retrato editorial'] } as T,
        provider: this.name,
        model: this.model,
        mode: this.mode,
        latencyMs: 1,
      };
    }
  }

  it('si la IA falló, "regenerar" vuelve a intentarlo; si ya está al día, no crea versiones', async () => {
    const ai = new FlakyAi();
    const flakyApp = buildTestApp(ai);
    const jhon = await registerUser(flakyApp, 'Jhon');
    const ws = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, ws, photographer);
    const url = `/api/workspaces/${ws}/personal-dna`;

    const first = (await jhon.agent.get(url).expect(200)).body.personalDna;
    expect(first.generator).toEqual({ kind: 'deterministic', version: 'personal-rules-1+ai' });

    const retried = (await jhon.agent.post(`${url}/generate`).expect(200)).body.personalDna;
    expect(retried).toMatchObject({
      version: 2,
      generator: { kind: 'ai' },
      professionalProfile: { strengths: ['retrato editorial'] },
    });

    await jhon.agent.post(`${url}/generate`).expect(200);
    expect(await PersonalDnaModel.countDocuments({ workspaceId: ws })).toBe(2);
    expect(ai.calls).toBe(2);
  });
});
