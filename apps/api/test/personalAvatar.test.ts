import {
  AvatarConceptSchema,
  AvatarResponseSchema,
  PersonalDnaContentSchema,
  PersonalOnboardingSchema,
  type PersonalDnaContent,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { personalAvatarEngine } from '../src/modules/avatars/engine/personalAvatarEngine.js';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { generatePersonalDnaContent } from '../src/modules/personal/personalDna.generator.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { photographer, streamer, type PersonalAnswers } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import {
  completePersonalOnboarding,
  createPersonalWorkspace,
  savePersonalStep,
} from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

const dnaOf = (answers: PersonalAnswers): PersonalDnaContent =>
  generatePersonalDnaContent(PersonalOnboardingSchema.parse(answers));
const conceptOf = (answers: PersonalAnswers, variation = 0) =>
  personalAvatarEngine.generate({ personalDna: dnaOf(answers), variation });

/** Rutas válidas del PersonalDNA ("creativeIdentity.styles", "workStyle"…). */
function isPersonalDnaPath(path: string): boolean {
  const [section, field] = path.split('.');
  const shape = PersonalDnaContentSchema.shape as Record<string, unknown>;
  if (!section || !(section in shape)) return false;
  if (!field) return true;
  const inner = (shape[section] as { shape?: Record<string, unknown> }).shape;
  return Boolean(inner && field in inner);
}

describe('PersonalAvatarConceptEngine', () => {
  it('fotógrafa editorial → cámara reinterpretada, sobria, mate y serena', async () => {
    const avatar = AvatarConceptSchema.parse(await conceptOf(photographer));
    expect(avatar).toMatchObject({
      avatarType: 'object_inspired',
      baseObject: { id: 'camera' },
      faceStyle: 'sculpted',
      animationPersonality: 'elegant_smooth',
      primaryColor: { hex: '#F2EFE9' },
      secondaryColor: { hex: '#1C1C1C' },
      renderHints: { finish: 'matte' },
    });
    // Minimalista: un solo accesorio, el que la identifica.
    expect(avatar.accessories).toEqual(['Lente de cámara al frente']);
    expect(avatar.avoid).toEqual(
      expect.arrayContaining(['filtros saturados', 'Estética infantil o de mascota genérica']),
    );
  });

  it('streamer enérgico → compañero creativo vibrante, con sus colores y auriculares', async () => {
    const avatar = AvatarConceptSchema.parse(await conceptOf(streamer));
    expect(avatar).toMatchObject({
      avatarType: 'creative_companion',
      animationPersonality: 'playful_bouncy',
      primaryColor: { hex: '#7C3AED' },
      speakingBehavior: { pace: 'lively' },
    });
    expect(avatar.accessories[0]).toBe('Auriculares de estudio');
    expect(avatar.faceStyle).not.toBe('expressive_cartoon');
  });

  it('dos personas distintas → personajes claramente distintos', async () => {
    const [a, b] = await Promise.all([conceptOf(photographer), conceptOf(streamer)]);
    expect(a.avatarType).not.toBe(b.avatarType);
    expect(a.renderHints.archetype).not.toBe(b.renderHints.archetype);
    expect(a.primaryColor.hex).not.toBe(b.primaryColor.hex);
    expect(a.idleBehavior.energy).toBeLessThan(b.idleBehavior.energy);
    expect(a.name).not.toBe(b.name);
  });

  it('no es "profesión → objeto": la misma profesión con otra personalidad cambia el personaje', async () => {
    const loudPhotographer: PersonalAnswers = {
      ...photographer,
      personality: streamer.personality,
      communication: streamer.communication,
      creative: streamer.creative,
    };
    const calm = await conceptOf(photographer);
    const loud = await conceptOf(loudPhotographer);
    expect(loud.primaryColor.hex).not.toBe(calm.primaryColor.hex);
    expect(loud.faceStyle).not.toBe(calm.faceStyle);
    expect(loud.animationPersonality).not.toBe(calm.animationPersonality);
  });

  it('justifica cada decisión con rutas del PersonalDNA (nunca del BrandDNA)', async () => {
    for (const answers of [photographer, streamer]) {
      const avatar = await conceptOf(answers);
      expect(avatar.rationale.decisions.length).toBeGreaterThanOrEqual(3);
      for (const decision of avatar.rationale.decisions) {
        for (const source of decision.sources) expect(isPersonalDnaPath(source), source).toBe(true);
      }
      expect(avatar.rationale.summary).toContain(answers.identity!.name);
    }
  });

  it('respeta lo que la persona pidió evitar', async () => {
    const noTechNoCartoon: PersonalAnswers = {
      ...streamer,
      creative: { ...streamer.creative, avoidVisuals: ['tecnológico', 'caricatura infantil'] },
    };
    const avatar = await conceptOf(noTechNoCartoon);
    expect(avatar.avatarType).not.toBe('tech_character');
    expect(avatar.mouthStyle).not.toBe('grin');
    expect(avatar.avoid).toEqual(expect.arrayContaining(['tecnológico', 'caricatura infantil']));
  });

  it('sin colores elegidos, la paleta sale de su estilo (no al azar)', async () => {
    const noColors: PersonalAnswers = {
      ...photographer,
      creative: { ...photographer.creative, colors: [] },
    };
    const avatar = await conceptOf(noColors);
    const colors = avatar.rationale.decisions.find((decision) => decision.attribute === 'colors');
    expect(colors?.reason).toMatch(/salen de tu estilo «minimalista»/);
    expect(colors?.sources).toEqual(['creativeIdentity.styles']);

    // Sin colores ni estilo o rasgo con paleta: lo dice así (nunca cita colores que no existen).
    const neutral = await conceptOf({
      ...photographer,
      personality: { traits: ['nocturna'] },
      creative: { ...photographer.creative, colors: [], styles: ['barroco'] },
    });
    const fallback = neutral.rationale.decisions.find(
      (decision) => decision.attribute === 'colors',
    );
    expect(fallback?.reason).toMatch(/paleta neutra/);
    expect(fallback?.reason).not.toMatch(/tu color principal/);
  });

  it('es determinístico y regenerar explora otra alternativa', async () => {
    expect(await conceptOf(photographer)).toEqual(await conceptOf(photographer));
    const second = await conceptOf(photographer, 1);
    expect(second.avatarType).not.toBe('object_inspired');
    expect(second.rationale.summary).toMatch(/alternativa/);
  });
});

describe('Avatar personal: API (mismo endpoint, resuelto por workspace.type)', () => {
  it('genera un AvatarProfile personal desde el PersonalDNA, sin companyId', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, ws, photographer);

    const res = await jhon.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(201);
    const body = AvatarResponseSchema.parse(res.body);
    expect(body).toMatchObject({
      sourceType: 'personal',
      dnaVersion: 1,
      brandDnaVersion: null,
      isStale: false,
      avatar: {
        workspaceId: ws,
        sourceType: 'personal',
        companyId: null,
        version: 1,
        personalDnaVersion: 1,
        brandDnaVersion: null,
        engine: { kind: 'deterministic', version: 'personal-avatar-rules-1', variation: 0 },
        avatarType: 'object_inspired',
      },
    });
    expect(body.history).toEqual([
      expect.objectContaining({ version: 1, dnaVersion: 1, brandDnaVersion: null }),
    ]);

    const stored = await AvatarProfileModel.findOne({ workspaceId: ws }).lean();
    expect(stored).not.toHaveProperty('companyId');
    expect(stored).not.toHaveProperty('brandDnaVersion');

    const profile = await jhon.agent.get(`/api/workspaces/${ws}/personal-profile`).expect(200);
    expect(profile.body.profile.avatarVersion).toBe(1);
    const again = await jhon.agent.get(`/api/workspaces/${ws}/avatar`).expect(200);
    expect(again.body.avatar.id).toBe(body.avatar!.id);
  });

  it('regenera, detecta cuando el ADN cambió y conserva el historial', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, ws, photographer);
    const url = `/api/workspaces/${ws}/avatar`;
    await jhon.agent.post(`${url}/generate`).expect(201);
    const second = await jhon.agent.post(`${url}/generate`).expect(201);
    expect(second.body.avatar).toMatchObject({ version: 2, engine: { variation: 1 } });

    await savePersonalStep(jhon, ws, 'personality', streamer).expect(200);
    const stale = await jhon.agent.get(url).expect(200);
    expect(stale.body).toMatchObject({ dnaVersion: 2, isStale: true });

    const fresh = await jhon.agent.post(`${url}/generate`).expect(201);
    expect(fresh.body).toMatchObject({
      isStale: false,
      avatar: { version: 3, personalDnaVersion: 2, engine: { variation: 0 } },
    });
    expect(fresh.body.history.map((item: { version: number }) => item.version)).toEqual([3, 2, 1]);
  });

  it('varios avatares personales (sin companyId) conviven sin conflictos de índices', async () => {
    const users = await Promise.all(['Ana', 'Beto', 'Caro'].map((name) => registerUser(app, name)));
    for (const [index, user] of users.entries()) {
      const ws = await createPersonalWorkspace(user, user.user.name);
      await completePersonalOnboarding(user, ws, index % 2 ? streamer : photographer);
      const res = await user.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(201);
      expect(res.body.avatar).toMatchObject({ version: 1, companyId: null });
    }
    expect(
      await AvatarProfileModel.collection.countDocuments({ sourceType: 'personal', version: 1 }),
    ).toBe(3);
  });

  it('Enterprise sigue generando su avatar desde el BrandDNA, también en la ruta de workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'TINTO');
    await completeOnboarding(jhon, companyId, cafeTinto);
    const ws = (await workspaceIdOf(companyId)).toString();
    const personal = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, personal, streamer);

    const brand = await jhon.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(201);
    expect(brand.body).toMatchObject({
      sourceType: 'brand',
      avatar: {
        sourceType: 'brand',
        companyId,
        brandDnaVersion: 1,
        baseObject: { id: 'coffee_bean' },
      },
    });
    const own = await jhon.agent.post(`/api/workspaces/${personal}/avatar/generate`).expect(201);
    // El avatar personal del mismo dueño no hereda nada de su marca.
    expect(own.body.avatar).toMatchObject({ sourceType: 'personal', companyId: null, version: 1 });
    expect(own.body.avatar.baseObject.id).not.toBe('coffee_bean');
    expect(JSON.stringify(own.body.avatar)).not.toMatch(/TINTO|Huila|caf[eé]/i);
  });

  it('otro usuario no puede ver ni generar el avatar personal ajeno (404)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const ws = await createPersonalWorkspace(alice, 'Alice');
    await completePersonalOnboarding(alice, ws, photographer);
    await alice.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(201);

    const read = await bob.agent.get(`/api/workspaces/${ws}/avatar`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('Obturador');
    await bob.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(404);
    expect(await AvatarProfileModel.countDocuments({ workspaceId: ws })).toBe(1);
  });
});
