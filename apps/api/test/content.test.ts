import { ContentItemListResponseSchema, ContentItemResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { createContent, createProject, daysFromNow, ops } from './support/operations.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('ContentItems', () => {
  let jhon: Session;
  let workspaceId: string;
  let url: ReturnType<typeof ops>;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await createPersonalWorkspace(jhon);
    url = ops(workspaceId);
  });

  it('crea una pieza solo con el título: idea, manual, sin publicar', async () => {
    const res = await jhon.agent
      .post(url.content)
      .send({ title: 'Cómo construí Pixel Personal' })
      .expect(201);
    expect(ContentItemResponseSchema.parse(res.body).contentItem).toMatchObject({
      workspaceId,
      projectId: null,
      title: 'Cómo construí Pixel Personal',
      status: 'idea',
      source: 'manual',
      platform: null,
      format: null,
      scheduledFor: null,
      publishedAt: null,
    });
  });

  it('crea una pieza completa vinculada a un proyecto del workspace', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    const scheduledFor = daysFromNow(8);
    const item = await createContent(jhon, workspaceId, {
      title: 'Reel del proceso',
      concept: 'Detrás de cámaras',
      objective: 'Mostrar el método',
      platform: 'instagram',
      format: 'reel',
      status: 'production',
      hook: '¿Y si tu director creativo fuera tuyo?',
      caption: 'Así trabajo.',
      script: 'Plano 1…',
      notes: 'Luz natural',
      projectId: project.id,
      scheduledFor,
      tags: ['proceso'],
    });
    expect(item).toMatchObject({
      platform: 'instagram',
      format: 'reel',
      status: 'production',
      projectId: project.id,
      scheduledFor,
      publishedAt: null,
    });
  });

  it('rechaza un proyecto externo (400) al crear y al editar', async () => {
    const ana = await registerUser(app, 'Ana');
    const anaWorkspace = await createPersonalWorkspace(ana, 'Ana');
    const foreign = await createProject(ana, anaWorkspace, { name: 'De Ana' });
    const res = await jhon.agent
      .post(url.content)
      .send({ title: 'X', projectId: foreign.id })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'projectId', message: 'Proyecto no encontrado' },
    ]);
    const item = await createContent(jhon, workspaceId, { title: 'Mía' });
    await jhon.agent.patch(`${url.content}/${item.id}`).send({ projectId: foreign.id }).expect(400);
    await jhon.agent.post(url.content).send({ title: 'X', source: 'pixel' }).expect(400);
    await jhon.agent.post(url.content).send({ title: 'X', workspaceId: anaWorkspace }).expect(400);
    expect(await ContentItemModel.countDocuments({ workspaceId: anaWorkspace })).toBe(0);
  });

  it('avanza por el pipeline y al publicar fija publishedAt; al volver atrás lo limpia', async () => {
    const item = await createContent(jhon, workspaceId, { title: 'Carrusel' });
    for (const status of ['planned', 'production', 'review', 'ready']) {
      const res = await jhon.agent.patch(`${url.content}/${item.id}`).send({ status }).expect(200);
      expect(res.body.contentItem).toMatchObject({ status, publishedAt: null });
    }
    const published = await jhon.agent
      .patch(`${url.content}/${item.id}`)
      .send({ status: 'published' })
      .expect(200);
    const publishedAt = published.body.contentItem.publishedAt as string;
    expect(Date.now() - Date.parse(publishedAt)).toBeLessThan(10_000);

    // Editar otra cosa conserva la fecha de publicación; archivar también.
    const edited = await jhon.agent
      .patch(`${url.content}/${item.id}`)
      .send({ caption: 'Nuevo caption' })
      .expect(200);
    expect(edited.body.contentItem.publishedAt).toBe(publishedAt);
    const archived = await jhon.agent
      .patch(`${url.content}/${item.id}`)
      .send({ status: 'archived' })
      .expect(200);
    expect(archived.body.contentItem.publishedAt).toBe(publishedAt);

    const back = await jhon.agent
      .patch(`${url.content}/${item.id}`)
      .send({ status: 'review' })
      .expect(200);
    expect(back.body.contentItem).toMatchObject({ status: 'review', publishedAt: null });
  });

  it('marcar como publicado acepta la fecha real de publicación', async () => {
    const item = await createContent(jhon, workspaceId, { title: 'Post' });
    const res = await jhon.agent
      .patch(`${url.content}/${item.id}`)
      .send({ status: 'published', publishedAt: '2026-10-01T15:00:00.000Z' })
      .expect(200);
    expect(res.body.contentItem.publishedAt).toBe('2026-10-01T15:00:00.000Z');
  });

  it('filtra por estado, plataforma, formato, proyecto y búsqueda; oculta archivados', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    await createContent(jhon, workspaceId, { title: 'Idea suelta' });
    await createContent(jhon, workspaceId, {
      title: 'Reel de TikTok',
      platform: 'tiktok',
      format: 'short_video',
      status: 'production',
      projectId: project.id,
    });
    await createContent(jhon, workspaceId, {
      title: 'Newsletter',
      platform: 'newsletter',
      format: 'newsletter',
      status: 'archived',
    });

    const titles = async (query: string) =>
      ContentItemListResponseSchema.parse(
        (await jhon.agent.get(`${url.content}?${query}`).expect(200)).body,
      ).contentItems.map((item) => item.title);
    expect(await titles('')).toEqual(['Reel de TikTok', 'Idea suelta']);
    expect(await titles('status=production')).toEqual(['Reel de TikTok']);
    expect(await titles('status=archived')).toEqual(['Newsletter']);
    expect(await titles('platform=tiktok')).toEqual(['Reel de TikTok']);
    expect(await titles('format=short_video')).toEqual(['Reel de TikTok']);
    expect(await titles(`projectId=${project.id}`)).toEqual(['Reel de TikTok']);
    expect(await titles('search=idea')).toEqual(['Idea suelta']);
    await jhon.agent.get(`${url.content}?platform=myspace`).expect(400);
  });

  it('elimina una pieza (204) y luego es 404', async () => {
    const item = await createContent(jhon, workspaceId, { title: 'Borrar' });
    await jhon.agent.delete(`${url.content}/${item.id}`).expect(204);
    await jhon.agent.get(`${url.content}/${item.id}`).expect(404);
  });
});
