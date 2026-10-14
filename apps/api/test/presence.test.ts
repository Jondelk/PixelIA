import {
  CampaignGenerationResponseSchema,
  PixelCommandResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createProject } from './support/operations.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;
const base = (workspaceId: string) => `/api/workspaces/${workspaceId}`;

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return (await workspaceIdOf(companyId)).toString();
}

async function command(session: Session, workspaceId: string, body: object, status = 201) {
  const res = await session.agent
    .post(`${base(workspaceId)}/pixel/commands`)
    .send(body)
    .expect(status);
  return status === 201 ? PixelCommandResponseSchema.parse(res.body).command : res.body;
}

async function campaign(session: Session, workspaceId: string, name: string) {
  const res = await session.agent
    .post(`${base(workspaceId)}/campaigns/generate`)
    .send({ name, objective: `Presentar ${name}.`, channels: ['Instagram'] })
    .expect(201);
  return CampaignGenerationResponseSchema.parse(res.body).campaign;
}

describe('Pixel Dock: el recurso que el usuario está viendo', () => {
  it('en la campaña X, «Hazme tres Reels con esto» planifica para X (validada en el backend)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const x = await campaign(jhon, tinto, 'Cosecha');
    await campaign(jhon, tinto, 'Navidad');
    const cmd = await command(jhon, tinto, {
      request: 'Hazme tres Reels con esto',
      contextHint: { resource: { type: 'campaign', id: x.id } },
    });
    expect(cmd.intent).toBe('plan_content');
    expect(cmd.status).toBe('proposed');
    expect(cmd.plan!.understood).toContain('Campaña: «Cosecha»');
  });

  it('en un proyecto, «Créame las tareas…» las apunta en ese proyecto', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const project = await createProject(jhon, tinto, { name: 'Sesión de fotos de cosecha' });
    const cmd = await command(jhon, tinto, {
      request: 'Créame las tareas: revisar locaciones, contratar fotógrafo',
      contextHint: { resource: { type: 'project', id: project.id } },
    });
    expect(cmd.status).toBe('proposed');
    expect(cmd.plan!.summary).toContain('«Sesión de fotos de cosecha»');
  });

  it('un recurso de otro workspace (mismo dueño) o de otro usuario se rechaza', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'Inventia', inventia);
    const labCampaign = await campaign(jhon, lab, 'Prototipos');
    const labProject = await createProject(jhon, lab, { name: 'Laboratorio' });
    for (const resource of [
      { type: 'campaign', id: labCampaign.id },
      { type: 'project', id: labProject.id },
      { type: 'content_plan', id: labProject.id },
    ]) {
      const body = await command(
        jhon,
        tinto,
        { request: 'Hazme tres Reels con esto', contextHint: { resource } },
        400,
      );
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
    const ana = await registerUser(app, 'Ana');
    const anaBrand = await brand(ana, 'Otra marca', cafeTinto);
    await command(
      ana,
      anaBrand,
      {
        request: 'Hazme tres Reels con esto',
        contextHint: { resource: { type: 'campaign', id: labCampaign.id } },
      },
      400,
    );
  });
});

describe('Voz: otra entrada de PixelCommand', () => {
  it('una transcripción entra exactamente igual que el texto (mismas validaciones y resultado)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const request = 'Necesito tres contenidos para esta semana en Instagram';
    const typed = await command(jhon, tinto, { request, source: 'text' });
    const spoken = await command(jhon, tinto, { request, source: 'voice' });
    expect(spoken.source).toBe('voice');
    expect(spoken.intent).toBe(typed.intent);
    expect(spoken.plan!.summary).toBe(typed.plan!.summary);
    // Recordar por voz usa el mismo flujo de memoria (nada aparte).
    const memory = await command(jhon, tinto, {
      request: 'De ahora en adelante evita las Stories',
      source: 'voice',
    });
    expect(memory.intent).toBe('manage_memory');
    // La voz no concede más permisos: el mismo límite de longitud y la misma confirmación.
    await command(jhon, tinto, { request: 'x'.repeat(2001), source: 'voice' }, 400);
    expect(spoken.status).toBe('proposed');
  });
});

describe('Tus Pixels: el personaje vigente en el resumen', () => {
  it('con personaje, su vista previa; sin él, null (nunca uno inventado)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const empty = (await createCompany(jhon, 'Sin ADN')) && null;
    void empty;
    await jhon.agent.post(`${base(tinto)}/avatar/generate`).expect(201);
    const list = WorkspaceListResponseSchema.parse(
      (await jhon.agent.get('/api/workspaces').expect(200)).body,
    ).workspaces;
    const withAvatar = list.find((entry) => entry.workspace.id === tinto)!;
    expect(withAvatar.avatar).toMatchObject({ version: 1 });
    expect(withAvatar.avatar!.primaryColor).toBeDefined();
    const without = list.find((entry) => entry.workspace.id !== tinto)!;
    expect(without.avatar).toBeNull();
    const single = WorkspaceResponseSchema.parse(
      (await jhon.agent.get(`${base(tinto)}`).expect(200)).body,
    );
    expect(single.avatar?.id).toBe(withAvatar.avatar!.id);
  });
});
