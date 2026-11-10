import { SendMessageResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import type { GenerateTextInput } from '../src/ai/AIProvider.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { photographer, streamer, type PersonalAnswers } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { jaccard } from './support/similarity.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();

type Session = Awaited<ReturnType<typeof registerUser>>;

/** Graba lo que recibe el proveedor y delega en el demo. */
class RecordingProvider implements AIProvider {
  readonly name = 'recording';
  readonly model = 'recording-1';
  readonly mode = 'demo' as const;
  calls: GenerateTextInput[] = [];
  private readonly demo = new DemoProvider();

  async generateText(input: GenerateTextInput) {
    this.calls.push(input);
    const reply = await this.demo.generateText(input);
    return { ...reply, provider: this.name, model: this.model };
  }

  generateStructuredOutput<T>(): Promise<{ data: T } & never> {
    throw new Error('no usado');
  }
}

const provider = new RecordingProvider();
const app = buildTestApp(provider);

beforeEach(() => {
  provider.calls = [];
});

async function personalPixel(session: Session, answers?: PersonalAnswers) {
  const workspaceId = await createPersonalWorkspace(session, session.user.name);
  if (answers) await completePersonalOnboarding(session, workspaceId, answers);
  return workspaceId;
}

/** Abre una conversación nueva, envía un mensaje y comprueba el estado esperado. */
async function ask(session: Session, workspaceId: string, content: string, status = 201) {
  const base = `/api/workspaces/${workspaceId}/conversations`;
  const conversation = (await session.agent.post(base).expect(201)).body.conversation;
  return session.agent
    .post(`${base}/${conversation.id as string}/messages`)
    .send({ content })
    .expect(status);
}

describe('Chat personal', () => {
  it('sin PersonalDNA responde 409 personal_context_not_configured y no llama a la IA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personalPixel(jhon);
    const res = await ask(jhon, ws, 'Hola Pixel', 409);
    expect(res.body.error.details).toEqual({ reason: 'personal_context_not_configured' });
    expect(provider.calls).toHaveLength(0);
    expect(await MessageModel.countDocuments({ workspaceId: ws })).toBe(0);
  });

  it('con PersonalDNA conversa usando el contexto personal', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ws = await personalPixel(jhon, photographer);
    await jhon.agent.post(`/api/workspaces/${ws}/avatar/generate`).expect(201);

    const res = await ask(jhon, ws, 'Hola Pixel, ¿por dónde empiezo?');
    const body = SendMessageResponseSchema.parse(res.body);
    expect(body.conversation).toMatchObject({ contextType: 'personal', companyId: null });
    expect(body.pixelMessage).toMatchObject({
      workspaceId: ws,
      companyId: null,
      role: 'pixel',
      meta: { brandDnaVersion: null, personalDnaVersion: 1, avatarVersion: 1 },
    });
    expect(body.pixelMessage.content).toMatch(/sesiones premium/);

    const call = provider.calls[0]!;
    expect(call.system).toContain('Director Creativo Personal de Valeria Mora');
    expect(call.system).not.toContain('<brand_context>');
  });

  it('otro usuario no puede conversar en el Pixel Personal ajeno (404)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const ws = await personalPixel(alice, photographer);
    await bob.agent.post(`/api/workspaces/${ws}/conversations`).expect(404);
    expect(provider.calls).toHaveLength(0);
  });

  it('el chat Enterprise sigue funcionando junto al personal del mismo dueño', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'TINTO');
    await completeOnboarding(jhon, companyId, cafeTinto);
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const personal = await personalPixel(jhon, streamer);

    const brand = await ask(jhon, enterprise, 'Necesito una campaña para redes.');
    const own = await ask(jhon, personal, 'Necesito ideas para redes.');
    expect(brand.body.pixelMessage.meta).toMatchObject({
      brandDnaVersion: 1,
      personalDnaVersion: null,
    });
    expect(own.body.pixelMessage.meta).toMatchObject({
      brandDnaVersion: null,
      personalDnaVersion: 1,
    });
    expect(brand.body.pixelMessage.content).toMatch(/nosotros|nuestr/i);
    expect(own.body.pixelMessage.content).not.toMatch(/Huila|TINTO|nuestra marca/i);
  });
});

describe('Prueba conceptual: misma pregunta, personas distintas', () => {
  it('fotógrafa editorial y streamer reciben respuestas claramente distintas', async () => {
    const question = '¿Qué debería publicar esta semana?';
    const valeria = await registerUser(app, 'Valeria');
    const mateo = await registerUser(app, 'Mateo');
    const a = (await ask(valeria, await personalPixel(valeria, photographer), question)).body
      .pixelMessage.content as string;
    const b = (await ask(mateo, await personalPixel(mateo, streamer), question)).body.pixelMessage
      .content as string;

    const similarity = jaccard(a, b);
    expect(
      similarity,
      `similitud ${similarity.toFixed(2)}\n--- fotógrafa\n${a}\n--- streamer\n${b}`,
    ).toBeLessThan(0.35);

    // Cada respuesta sale de SU ADN: objetivo, plataformas, ritmo y límites propios.
    expect(a).toMatch(/sesiones premium/);
    expect(a).toMatch(/Instagram|LinkedIn/);
    expect(a).toMatch(/pausad|aire/);
    expect(a).not.toMatch(/Twitch|comunidad|streamer|directo/i);
    expect(b).toMatch(/comunidad/);
    expect(b).toMatch(/Twitch|TikTok/);
    expect(b).toMatch(/cortes rápidos|clips cortos/);
    expect(b).not.toMatch(/premium|retrato|LinkedIn/i);

    // Ninguna es la respuesta genérica que no usa el ADN.
    for (const reply of [a, b]) {
      expect(reply).not.toMatch(/publica un reel, un carrusel y una historia/i);
    }

    // El contexto que recibió el modelo también es distinto por persona.
    const [first, second] = provider.calls.slice(-2);
    expect(jaccard(first!.system, second!.system)).toBeLessThan(0.75);
  });
});
