import { SendMessageResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AIProvider, GenerateTextInput } from '../src/ai/AIProvider.js';
import { AIProviderError } from '../src/ai/errors.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { ConversationModel } from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { jaccard } from './support/similarity.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();

type Session = Awaited<ReturnType<typeof registerUser>>;

/** Proveedor que graba lo que recibe y delega en el demo (o falla a demanda). */
class RecordingProvider implements AIProvider {
  readonly name = 'recording';
  readonly model = 'recording-1';
  readonly mode = 'demo' as const;
  calls: GenerateTextInput[] = [];
  failWith: AIProviderError | null = null;
  private readonly demo = new DemoProvider();

  async generateText(input: GenerateTextInput) {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;
    const reply = await this.demo.generateText(input);
    return { ...reply, provider: this.name, model: this.model };
  }

  generateStructuredOutput<T>(): Promise<{ data: T } & never> {
    throw new Error('no usado');
  }
}

const provider = new RecordingProvider();
const app = buildTestApp(provider);

async function companyWithPixel(session: Session, answers: typeof cafeTinto, avatar = true) {
  const companyId = await createCompany(session, answers.company.name);
  await completeOnboarding(session, companyId, answers);
  if (avatar) await session.agent.post(`/api/companies/${companyId}/avatar/generate`).expect(201);
  return companyId;
}

async function newConversation(session: Session, companyId: string): Promise<string> {
  const res = await session.agent.post(`/api/companies/${companyId}/conversations`).expect(201);
  return res.body.conversation.id as string;
}

function send(session: Session, companyId: string, conversationId: string, content: string) {
  return session.agent
    .post(`/api/companies/${companyId}/conversations/${conversationId}/messages`)
    .send({ content });
}

beforeEach(() => {
  provider.calls = [];
  provider.failWith = null;
});

describe('Chat con Pixel: flujo completo', () => {
  let owner: Session;
  let companyId: string;
  let conversationId: string;

  beforeEach(async () => {
    owner = await registerUser(app, 'Ana');
    companyId = await companyWithPixel(owner, cafeTinto);
    conversationId = await newConversation(owner, companyId);
  });

  it('responde con el contexto de la empresa y persiste ambos mensajes', async () => {
    const res = await send(
      owner,
      companyId,
      conversationId,
      '  Necesito lanzar un nuevo café premium.  ',
    ).expect(201);
    const body = SendMessageResponseSchema.parse(res.body);

    expect(body.userMessage).toMatchObject({
      role: 'user',
      content: 'Necesito lanzar un nuevo café premium.',
      companyId,
      conversationId,
    });
    expect(body.pixelMessage).toMatchObject({
      role: 'pixel',
      companyId,
      userId: owner.user.id,
      meta: { provider: 'recording', brandDnaVersion: 1, avatarVersion: 1 },
    });
    expect(Date.parse(body.pixelMessage.createdAt)).toBeGreaterThan(
      Date.parse(body.userMessage.createdAt),
    );
    expect(body.conversation).toMatchObject({
      title: 'Necesito lanzar un nuevo café premium.',
      messageCount: 2,
    });

    // El modelo recibió el contexto de ESTA empresa.
    const call = provider.calls[0]!;
    expect(call.system).toContain('director creativo de Café Tinto');
    expect(call.system).toContain('Huila, Colombia');
    expect(call.messages).toEqual([
      { role: 'user', content: 'Necesito lanzar un nuevo café premium.' },
    ]);

    // Criterio, no recitación: la respuesta construye sobre el origen sin describir la marca.
    expect(body.pixelMessage.content).toMatch(/Huila/);
    expect(body.pixelMessage.content).not.toMatch(/^(tu|nuestra) (empresa|marca) es/i);

    const stored = await owner.agent
      .get(`/api/companies/${companyId}/conversations/${conversationId}/messages`)
      .expect(200);
    expect(stored.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'pixel']);
  });

  it('usa el historial de la conversación en el siguiente mensaje', async () => {
    await send(owner, companyId, conversationId, 'Necesito una campaña para redes.').expect(201);
    await send(owner, companyId, conversationId, 'Hazla más corta').expect(201);

    const second = provider.calls[1]!;
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second.messages[0]?.content).toBe('Necesito una campaña para redes.');
  });

  it('incluye el personaje solo cuando la pregunta lo requiere', async () => {
    await send(owner, companyId, conversationId, 'Necesito una campaña para redes.').expect(201);
    await send(
      owner,
      companyId,
      conversationId,
      '¿Cómo usamos a nuestro personaje en redes?',
    ).expect(201);
    expect(provider.calls[0]!.system).not.toContain('Nuestro personaje,');
    expect(provider.calls[1]!.system).toContain('Nuestro personaje,');
  });

  it('valida el mensaje', async () => {
    await send(owner, companyId, conversationId, '   ').expect(400);
    await send(owner, companyId, conversationId, 'x'.repeat(4001)).expect(400);
    expect(provider.calls).toHaveLength(0);
  });

  it('si la IA falla responde 503 y no guarda nada', async () => {
    provider.failWith = new AIProviderError('unavailable', 'caído');
    const res = await send(owner, companyId, conversationId, 'Hola');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await MessageModel.countDocuments({ companyId })).toBe(0);

    provider.failWith = new AIProviderError('refused', 'no');
    const refused = await send(owner, companyId, conversationId, 'Hola');
    expect(refused.status).toBe(422);

    const conversation = await owner.agent
      .get(`/api/companies/${companyId}/conversations`)
      .expect(200);
    expect(conversation.body.conversations[0].messageCount).toBe(0);
  });

  it('sin BrandDNA no hay conversación posible (409)', async () => {
    const draftCompany = await createCompany(owner, 'Sin ADN');
    const draftConversation = await newConversation(owner, draftCompany);
    await send(owner, draftCompany, draftConversation, 'Hola').expect(409);
  });
});

describe('Chat con Pixel: aislamiento por empresa', () => {
  it('otro usuario no puede listar, leer ni escribir en conversaciones ajenas', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const companyId = await companyWithPixel(alice, cafeTinto, false);
    const conversationId = await newConversation(alice, companyId);
    await send(alice, companyId, conversationId, 'Hola Pixel').expect(201);

    await bob.agent.get(`/api/companies/${companyId}/conversations`).expect(404);
    await bob.agent
      .get(`/api/companies/${companyId}/conversations/${conversationId}/messages`)
      .expect(404);
    await send(bob, companyId, conversationId, 'Intruso').expect(404);
    expect(await MessageModel.countDocuments({ companyId })).toBe(2);
  });

  it('una conversación de una empresa no se puede usar desde otra empresa del mismo dueño', async () => {
    const alice = await registerUser(app, 'Alice');
    const cafeId = await companyWithPixel(alice, cafeTinto, false);
    const novaId = await companyWithPixel(alice, novaLabs, false);
    const cafeConversation = await newConversation(alice, cafeId);

    await send(alice, novaId, cafeConversation, 'Hola').expect(404);
    await alice.agent
      .get(`/api/companies/${novaId}/conversations/${cafeConversation}/messages`)
      .expect(404);
    const novaList = await alice.agent.get(`/api/companies/${novaId}/conversations`).expect(200);
    expect(novaList.body.conversations).toEqual([]);
  });

  it('los modelos exigen companyId en cada consulta', async () => {
    await expect(MessageModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(ConversationModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('Misma pregunta, empresas distintas', () => {
  it('café artesanal y startup tecnológica reciben enfoques claramente distintos', async () => {
    const owner = await registerUser(app, 'Ana');
    const cafeId = await companyWithPixel(owner, cafeTinto);
    const novaId = await companyWithPixel(owner, novaLabs);
    const question = 'Necesito una campaña para redes.';

    const cafe = (
      await send(owner, cafeId, await newConversation(owner, cafeId), question).expect(201)
    ).body.pixelMessage.content as string;
    const nova = (
      await send(owner, novaId, await newConversation(owner, novaId), question).expect(201)
    ).body.pixelMessage.content as string;

    // Enfoques distintos: poco vocabulario en común.
    const similarity = jaccard(cafe, nova);
    expect(
      similarity,
      `similitud ${similarity.toFixed(2)}\n--- café\n${cafe}\n--- nova\n${nova}`,
    ).toBeLessThan(0.35);

    // Cada una construye sobre SU marca y nunca sobre la otra.
    expect(cafe).toMatch(/Huila|caf[eé]|finca|origen/i);
    expect(cafe).not.toMatch(/Nova Labs|automatiz/i);
    expect(nova).toMatch(/Integraci[oó]n en un d[ií]a|hojas de c[aá]lculo|LinkedIn|auditable/i);
    expect(nova).not.toMatch(/Café Tinto|Huila|finca/i);

    // El contexto que recibió el modelo también es distinto por empresa.
    const [cafeCall, novaCall] = provider.calls.slice(-2);
    expect(jaccard(cafeCall!.system, novaCall!.system)).toBeLessThan(0.75);
  });
});
