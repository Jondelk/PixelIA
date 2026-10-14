import {
  AcceptContentPlanItemResponseSchema,
  CampaignGenerationResponseSchema,
  ContentPlanResponseSchema,
  CreativeMemoryActionResponseSchema,
  CreativeMemoryListResponseSchema,
  CreativeMemoryResponseSchema,
  DailyBriefResponseSchema,
  GuardianReportResponseSchema,
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type CreativeMemory,
  type PixelCommand,
} from '@pixel/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { CreativeDecisionEventModel } from '../src/modules/creative-memory/creativeDecisionEvent.model.js';
import { CreativeMemoryModel } from '../src/modules/creative-memory/creativeMemory.model.js';
import { migrateLegacyCreativeMemories } from '../src/modules/creative-memory/creativeMemory.migration.js';
import { detectPatterns } from '../src/modules/creative-memory/memory.detector.js';
import { resolveCreativeMemories } from '../src/modules/creative-memory/memory.resolver.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { creativeDirector } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createContent, createTask, daysFromNow } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();

/**
 * Demo que, en la estrategia de campaña, propone un CTA de urgencia: así se ve si la memoria
 * mejora la generación aguas arriba (antes de que el Guardian tenga que corregirlo).
 */
class UrgentCtaProvider extends DemoProvider {
  override async generateStructuredOutput<T>(
    ...args: Parameters<AIProvider['generateStructuredOutput']>
  ) {
    const result = await super.generateStructuredOutput<T>(...(args as [never]));
    if (args[0].schemaName === 'campaign_strategy') {
      (result.data as { callToAction: string }).callToAction = 'Compra ya';
    }
    return result;
  }
}
const app = buildTestApp(new UrgentCtaProvider());

type Session = Awaited<ReturnType<typeof registerUser>>;
const base = (workspaceId: string) => `/api/workspaces/${workspaceId}`;

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return (await workspaceIdOf(companyId)).toString();
}

async function personal(session: Session) {
  const id = await createPersonalWorkspace(session, session.user.name);
  await completePersonalOnboarding(session, id, creativeDirector);
  return id;
}

const workspaceDoc = async (id: string) => (await WorkspaceModel.findOne({ _id: id }).exec())!;

async function command(session: Session, workspaceId: string, request: string, extra = {}) {
  const res = await session.agent
    .post(`${base(workspaceId)}/pixel/commands`)
    .send({ request, ...extra })
    .expect(201);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function adjust(session: Session, workspaceId: string, cmd: PixelCommand, message: string) {
  const res = await session.agent
    .post(`${base(workspaceId)}/pixel/commands/${cmd.id}/adjust`)
    .send({ message })
    .expect(200);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function confirm(session: Session, workspaceId: string, cmd: PixelCommand) {
  const res = await session.agent
    .post(`${base(workspaceId)}/pixel/commands/${cmd.id}/confirm`)
    .send({ revision: cmd.plan!.revision })
    .expect(200);
  return PixelCommandConfirmResponseSchema.parse(res.body).command;
}

/** Recordar por conversación: una propuesta y una confirmación. */
async function rememberByCommand(session: Session, workspaceId: string, request: string) {
  const proposed = await command(session, workspaceId, request);
  expect(proposed).toMatchObject({ intent: 'manage_memory', status: 'proposed' });
  expect(proposed.plan!.steps.map((step) => step.type)).toEqual(['remember_memory']);
  const done = await confirm(session, workspaceId, proposed);
  expect(done.status).toBe('completed');
  return done;
}

async function memories(session: Session, workspaceId: string, view = 'all') {
  const res = await session.agent
    .get(`${base(workspaceId)}/creative-memories?view=${view}`)
    .expect(200);
  return CreativeMemoryListResponseSchema.parse(res.body).memories;
}

async function remember(session: Session, workspaceId: string, text: string, scope?: object) {
  const res = await session.agent
    .post(`${base(workspaceId)}/creative-memories/remember`)
    .send({ text, ...(scope ? { scope } : {}) });
  expect([200, 201]).toContain(res.status);
  return CreativeMemoryActionResponseSchema.parse(res.body).memory;
}

async function action(session: Session, workspaceId: string, memory: CreativeMemory, verb: string) {
  const res = await session.agent
    .post(`${base(workspaceId)}/creative-memories/${memory.id}/${verb}`)
    .expect(200);
  return CreativeMemoryActionResponseSchema.parse(res.body).memory;
}

const week = { startDate: '2026-10-19', endDate: '2026-10-25', frequency: 3, tzOffset: 300 };

async function plan(session: Session, workspaceId: string, body: object) {
  const res = await session.agent
    .post(`${base(workspaceId)}/content-plans/generate`)
    .send({ ...week, platforms: ['instagram'], ...body })
    .expect(201);
  return ContentPlanResponseSchema.parse(res.body);
}

const reject = (session: Session, workspaceId: string, planId: string, itemId: string) =>
  session.agent
    .post(`${base(workspaceId)}/content-plans/${planId}/items/${itemId}/reject`)
    .send({})
    .expect(200);

async function campaign(session: Session, workspaceId: string, name: string) {
  const res = await session.agent
    .post(`${base(workspaceId)}/campaigns/generate`)
    .send({ name, objective: `Presentar ${name} desde el origen.`, channels: ['Instagram'] })
    .expect(201);
  return CampaignGenerationResponseSchema.parse(res.body);
}

/** Tres rechazos de Stories en dos planes distintos (decisiones independientes). */
async function rejectStoriesTwice(session: Session, workspaceId: string) {
  const a = await plan(session, workspaceId, { formats: ['story'] });
  const b = await plan(session, workspaceId, { formats: ['story'] });
  expect(a.items.every((item) => item.format === 'story')).toBe(true);
  await reject(session, workspaceId, a.plan.id, a.items[0]!.id);
  await reject(session, workspaceId, a.plan.id, a.items[1]!.id);
  return { a, b, last: () => reject(session, workspaceId, b.plan.id, b.items[0]!.id) };
}

describe('Memoria explícita por conversación', () => {
  it('"De ahora en adelante evita CTA urgentes": 1 memoria activa del workspace que mejora la campaña; olvidarla la retira', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);

    const before = await campaign(jhon, tinto, 'Cosecha');
    expect(before.strategy.callToAction).toBe('Compra ya');

    const done = await rememberByCommand(jhon, tinto, 'De ahora en adelante evita CTA urgentes.');
    expect(done.reply).toMatch(/lo recordaré/i);
    const [memory] = await memories(jhon, tinto, 'active');
    expect(memory).toMatchObject({
      status: 'active',
      origin: 'explicit',
      normalizedKey: 'communication:urgency:avoid',
      scope: { type: 'workspace', id: null },
      confirmedByUser: true,
      contextType: 'enterprise',
    });
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(1);
    expect(
      await CreativeDecisionEventModel.countDocuments({
        workspaceId: tinto,
        eventType: 'explicit_memory_instruction',
      }),
    ).toBe(1);

    const after = await campaign(jhon, tinto, 'Navidad');
    expect(after.strategy.callToAction).toBe('Descúbrelo');
    expect(after.strategy.generation.memoryKeys).toContain('communication:urgency:avoid');
    expect(after.strategy.rationale).toMatch(/lo que Pixel ha aprendido/);

    // "¿Qué has aprendido de TINTO?" responde con memoria REAL (sin inventar nada).
    const shown = await command(jhon, tinto, '¿Qué has aprendido de Café Tinto?');
    expect(shown).toMatchObject({ intent: 'manage_memory', status: 'answered' });
    expect(shown.reply).toContain('Evitar CTA de urgencia');

    // Olvidar por conversación: propuesta + confirmación; después la campaña vuelve a lo de antes.
    const forget = await command(jhon, tinto, 'Olvida lo de evitar CTA urgentes');
    expect(forget.plan!.steps.map((step) => step.type)).toEqual(['forget_memory']);
    expect(forget.reply).toContain('Voy a dejar de usar esta preferencia');
    await confirm(jhon, tinto, forget);
    expect(await memories(jhon, tinto, 'active')).toEqual([]);
    expect((await memories(jhon, tinto, 'history'))[0]).toMatchObject({ status: 'forgotten' });
    const later = await campaign(jhon, tinto, 'Aniversario');
    expect(later.strategy.callToAction).toBe('Compra ya');
  });

  it('una petición temporal ("hoy no uses Stories") afecta a la solicitud, nunca crea memoria', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const cmd = await command(jhon, tinto, 'Hoy no uses Stories en el contenido de Instagram');
    expect(cmd.intent).toBe('plan_content');
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
    expect(await CreativeDecisionEventModel.countDocuments({ workspaceId: tinto })).toBe(0);
  });

  it('nunca guarda hechos, credenciales ni (Personal) datos sensibles', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const factual = await command(jhon, tinto, 'Recuerda que somos el café #1 del Cauca');
    expect(factual.status).toBe('answered');
    expect(factual.reply).toMatch(/no una preferencia creativa/);
    const res = await jhon.agent
      .post(`${base(tinto)}/creative-memories/remember`)
      .send({ text: 'Tenemos 20.000 clientes en el Cauca' })
      .expect(400);
    expect(res.body.error.details).toMatchObject({ reason: 'creative_memory_not_allowed' });

    const me = await personal(jhon);
    const sensitive = await command(jhon, me, 'Recuerda que tengo ansiedad cuando grabo videos');
    expect(sensitive.reply).toMatch(/información personal sensible/);
    const secret = await command(jhon, me, 'Recuerda que mi contraseña es pixel123');
    expect(secret.reply).toMatch(/contraseña/);
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: me })).toBe(0);
  });

  it('alcance ambiguo: UNA pregunta; "solo para la campaña" crea una memoria de esa campaña', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign: cosecha } = await campaign(jhon, tinto, 'Cosecha');
    const asked = await command(jhon, tinto, 'Recuerda que quiero usar fondos oscuros');
    expect(asked.status).toBe('needs_information');
    expect(asked.question).toMatch(/solo para una campaña o para Café Tinto en general/);
    const proposed = await adjust(jhon, tinto, asked, 'Solo para la campaña Cosecha');
    expect(proposed.status).toBe('proposed');
    expect(proposed.plan!.understood).toContain('Aplica a: solo la campaña «Cosecha»');
    await confirm(jhon, tinto, proposed);
    const [memory] = await memories(jhon, tinto, 'active');
    expect(memory!.scope).toMatchObject({ type: 'campaign', id: cosecha.id, label: 'Cosecha' });
  });

  it('contradicción en el mismo alcance: la anterior queda reemplazada, nunca editada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    await rememberByCommand(jhon, tinto, 'De ahora en adelante evita las Stories');
    await rememberByCommand(jhon, tinto, 'Desde ahora sí quiero usar Stories habitualmente');
    const all = await memories(jhon, tinto);
    const old = all.find((m) => m.normalizedKey === 'format:story:avoid')!;
    const current = all.find((m) => m.normalizedKey === 'format:story:prefer')!;
    expect(old.status).toBe('superseded');
    expect(old.supersededByMemoryId).toBe(current.id);
    expect(current).toMatchObject({ status: 'active', supersedesMemoryId: old.id });
  });
});

describe('De decisiones a candidatas (nunca activas solas)', () => {
  it('un override del Guardian: 1 evento y ninguna memoria', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const report = GuardianReportResponseSchema.parse(
      (
        await jhon.agent
          .post(`${base(tinto)}/guardian/evaluate`)
          .send({
            resourceType: 'copy',
            content: 'Fotos con luces de neón sobre el grano de la finca',
          })
          .expect(201)
      ).body,
    ).report;
    const finding = report.findings.find(
      (f) => f.canOverride && /ne[oó]n/i.test(f.title + f.message),
    );
    expect(finding).toBeDefined();
    await jhon.agent
      .post(`${base(tinto)}/guardian/reports/${report.id}/override`)
      .send({ findingId: finding!.id })
      .expect(200);
    const events = await CreativeDecisionEventModel.find({ workspaceId: tinto });
    expect(events.map((e) => e.eventType)).toEqual(['guardian_override']);
    expect(events[0]!.signals.map((s) => s.normalizedKey)).toContain('visual:neon:prefer');
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
  });

  it('3 decisiones en 2 planes → candidata (no activa); confirmar la activa y el planner la aplica', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { last } = await rejectStoriesTwice(jhon, tinto);
    // Dos rechazos del MISMO plan no bastan.
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
    await last();
    const [candidate] = await memories(jhon, tinto, 'candidate');
    expect(candidate).toMatchObject({
      status: 'candidate',
      normalizedKey: 'format:story:avoid',
      origin: 'decision_pattern',
      confirmedByUser: false,
      evidenceCount: 3,
    });
    expect(candidate!.evidenceSummary).toMatch(/En 3 decisiones sobre 2 planes diferentes/);
    expect(await memories(jhon, tinto, 'active')).toEqual([]);

    // "¿Por qué Pixel piensa esto?": evidencia humana, sin ids.
    const detail = CreativeMemoryResponseSchema.parse(
      (await jhon.agent.get(`${base(tinto)}/creative-memories/${candidate!.id}`).expect(200)).body,
    );
    expect(detail.evidence).toHaveLength(3);
    expect(detail.evidence[0]!.description).toMatch(/Quitaste una pieza \(Historia\) de «/);
    expect(JSON.stringify(detail.evidence)).not.toMatch(/[a-f\d]{24}/);

    const active = await action(jhon, tinto, candidate!, 'confirm');
    expect(active).toMatchObject({ status: 'active', confirmedByUser: true });
    const resolved = await resolveCreativeMemories(await workspaceDoc(tinto), {
      dimensions: ['format'],
    });
    expect(resolved.memories.map((m) => m.normalizedKey)).toEqual(['format:story:avoid']);
    const next = await plan(jhon, tinto, {});
    expect(next.items.some((item) => item.format === 'story')).toBe(false);
    expect(next.plan.generation!.memoryKeys).toContain('format:story:avoid');

    // Lo que pides ahora manda: "esta vez quiero Stories" → hay Stories y la memoria sigue activa.
    const asked = await plan(jhon, tinto, { formats: ['story'] });
    expect(asked.items.every((item) => item.format === 'story')).toBe(true);
    expect((await memories(jhon, tinto, 'active'))[0]!.status).toBe('active');
  });

  it('descartar una candidata ("no fue intencional"): nunca entra al resolver', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { last } = await rejectStoriesTwice(jhon, tinto);
    await last();
    const [candidate] = await memories(jhon, tinto, 'candidate');
    expect(await action(jhon, tinto, candidate!, 'dismiss')).toMatchObject({ status: 'dismissed' });
    expect((await resolveCreativeMemories(await workspaceDoc(tinto))).memories).toEqual([]);
  });

  it('olvidar + anti-reaprendizaje: los eventos viejos no la recrean; los nuevos sí', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { last } = await rejectStoriesTwice(jhon, tinto);
    await last();
    const [candidate] = await memories(jhon, tinto, 'candidate');
    const active = await action(jhon, tinto, candidate!, 'confirm');
    expect(await action(jhon, tinto, active, 'forget')).toMatchObject({ status: 'forgotten' });
    expect((await resolveCreativeMemories(await workspaceDoc(tinto))).memories).toEqual([]);

    const workspace = await workspaceDoc(tinto);
    for (const event of await CreativeDecisionEventModel.find({ workspaceId: tinto })) {
      await detectPatterns(workspace, event);
    }
    expect(await memories(jhon, tinto, 'candidate')).toEqual([]);

    const again = await rejectStoriesTwice(jhon, tinto);
    await again.last();
    expect(await memories(jhon, tinto, 'candidate')).toHaveLength(1);
  });

  it('sin duplicados: nuevas señales iguales refuerzan la memoria existente', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const memory = await remember(jhon, tinto, 'De ahora en adelante evita las Stories');
    expect(memory.evidenceCount).toBe(0);
    const { last } = await rejectStoriesTwice(jhon, tinto);
    await last();
    const all = await CreativeMemoryModel.find({ workspaceId: tinto });
    expect(all).toHaveLength(1);
    expect(all[0]!.evidenceCount).toBe(3);
    expect(all[0]!.status).toBe('active');
    // Recordarlo otra vez tampoco duplica.
    await remember(jhon, tinto, 'Nunca uses Stories');
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(1);
  });

  it('sin auto-refuerzo: aceptar tal cual lo que Pixel eligió por una memoria no cuenta', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const memory = await remember(jhon, tinto, 'Prefiero los Reels');
    expect(memory.normalizedKey).toBe('format:reel:prefer');
    const generated = await plan(jhon, tinto, {});
    expect(generated.plan.generation!.memoryKeys).toContain('format:reel:prefer');
    const reel = generated.items.find((item) => item.format === 'reel')!;
    expect(reel).toBeDefined();
    const res = await jhon.agent
      .post(`${base(tinto)}/content-plans/${generated.plan.id}/items/${reel.id}/accept`)
      .expect(201);
    AcceptContentPlanItemResponseSchema.parse(res.body);
    const event = await CreativeDecisionEventModel.findOne({
      workspaceId: tinto,
      eventType: 'content_plan_item_accepted',
    });
    expect(event!.metadata.influencedByMemory).toBe(true);
    const after = await CreativeMemoryModel.findOne({ workspaceId: tinto });
    expect(after!.evidenceCount).toBe(0);
  });

  it('editar y aceptar: decisión fuerte con su antes/después compacto; idempotente', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const generated = await plan(jhon, tinto, { formats: ['story'] });
    const item = generated.items[0]!;
    await jhon.agent
      .patch(`${base(tinto)}/content-plans/${generated.plan.id}/items/${item.id}`)
      .send({ format: 'reel' })
      .expect(200);
    await jhon.agent
      .post(`${base(tinto)}/content-plans/${generated.plan.id}/items/${item.id}/accept`)
      .expect(201);
    const event = await CreativeDecisionEventModel.findOne({ workspaceId: tinto });
    expect(event).toMatchObject({ eventType: 'content_plan_item_edited_then_accepted' });
    expect(event!.signals.map((s) => [s.normalizedKey, s.strength])).toEqual([
      ['format:story:avoid', 'high'],
      ['format:reel:prefer', 'high'],
    ]);
    expect(event!.toObject().before).toEqual(
      expect.arrayContaining([{ field: 'Formato', value: 'story' }]),
    );

    // Idempotencia: rechazar, volver a proponer y rechazar la misma pieza → un solo evento.
    const other = generated.items[1]!;
    const items = `${base(tinto)}/content-plans/${generated.plan.id}/items/${other.id}`;
    await jhon.agent.post(`${items}/reject`).send({}).expect(200);
    await jhon.agent.patch(items).send({ status: 'proposed' }).expect(200);
    await jhon.agent.post(`${items}/reject`).send({}).expect(200);
    expect(
      await CreativeDecisionEventModel.countDocuments({
        workspaceId: tinto,
        eventType: 'content_plan_item_rejected',
      }),
    ).toBe(1);
    // Inmutable: un evento nunca se reescribe.
    await expect(
      CreativeDecisionEventModel.updateOne({ workspaceId: tinto }, { $set: { description: 'x' } }),
    ).rejects.toThrow(/inmutable/);
  });

  it('sintetizador: 3 ediciones de texto libre en piezas de Pixel → candidata (una llamada, no por evento)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const a = await plan(jhon, tinto, {});
    const b = await plan(jhon, tinto, {});
    const accepted = [];
    for (const [generated, item] of [
      [a, a.items[0]!],
      [a, a.items[1]!],
      [b, b.items[0]!],
    ] as const) {
      const res = await jhon.agent
        .post(`${base(tinto)}/content-plans/${generated.plan.id}/items/${item.id}/accept`)
        .expect(201);
      accepted.push(AcceptContentPlanItemResponseSchema.parse(res.body).contentItem!);
    }
    const questions = [
      '¿Sabes de dónde viene tu taza?',
      '¿Conoces la finca de tu grano?',
      '¿Por qué tostamos cada semana?',
    ];
    for (const [index, item] of accepted.entries()) {
      await jhon.agent
        .patch(`${base(tinto)}/content/${item.id}`)
        .send({ title: questions[index] })
        .expect(200);
      // Antes de la tercera edición no hay evidencia suficiente: nada.
      if (index < 2)
        expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
    }
    const [candidate] = await memories(jhon, tinto, 'candidate');
    expect(candidate).toMatchObject({
      status: 'candidate',
      origin: 'decision_pattern',
      normalizedKey: 'communication:questions:prefer',
      evidenceCount: 3,
    });
    expect(await memories(jhon, tinto, 'active')).toEqual([]);
  });

  it('un ajuste a una propuesta ("sin Stories") es evidencia, no memoria', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const proposed = await command(
      jhon,
      tinto,
      'Plan de contenido para la próxima semana en Instagram',
    );
    expect(proposed.status).toBe('proposed');
    await adjust(jhon, tinto, proposed, 'Sin Stories');
    const [event] = await CreativeDecisionEventModel.find({ workspaceId: tinto });
    expect(event).toMatchObject({ eventType: 'pixel_command_adjusted' });
    expect(event!.signals.map((s) => s.normalizedKey)).toEqual(['format:story:avoid']);
    expect(await CreativeMemoryModel.countDocuments({ workspaceId: tinto })).toBe(0);
  });

  it('si registrar la decisión falla, la acción principal no se deshace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const generated = await plan(jhon, tinto, {});
    const spy = vi
      .spyOn(CreativeDecisionEventModel, 'create')
      .mockRejectedValueOnce(new Error('caída'));
    const res = await jhon.agent
      .post(
        `${base(tinto)}/content-plans/${generated.plan.id}/items/${generated.items[0]!.id}/accept`,
      )
      .expect(201);
    spy.mockRestore();
    expect(AcceptContentPlanItemResponseSchema.parse(res.body).created).toBe(true);
    expect(await CreativeDecisionEventModel.countDocuments({ workspaceId: tinto })).toBe(0);
  });
});

describe('Alcance y Brand Guardian', () => {
  it('excepción de la campaña X: allí el Guardian no repite el aviso de neón; en Y sí', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign: x } = await campaign(jhon, tinto, 'Cosecha');
    const { campaign: y } = await campaign(jhon, tinto, 'Navidad');
    const general = await remember(jhon, tinto, 'De ahora en adelante evita el neón');
    await rememberByCommand(jhon, tinto, 'Solo en la campaña Cosecha podemos usar neón');
    const exception = (await memories(jhon, tinto, 'active')).find((m) => m.polarity === 'allow')!;
    expect(exception).toMatchObject({
      kind: 'exception',
      normalizedKey: 'visual:neon:allow',
      scope: { type: 'campaign', id: x.id },
    });

    const inX = await resolveCreativeMemories(await workspaceDoc(tinto), { campaignId: x.id });
    expect(inX.memories.map((m) => m.normalizedKey)).toContain('visual:neon:allow');
    expect(inX.suspended.map((m) => m.id)).toContain(general.id);
    const inY = await resolveCreativeMemories(await workspaceDoc(tinto), { campaignId: y.id });
    expect(inY.memories.map((m) => m.normalizedKey)).toContain('visual:neon:avoid');
    expect(inY.memories.map((m) => m.normalizedKey)).not.toContain('visual:neon:allow');

    const review = async (campaignId: string) => {
      const item = await createContent(jhon, tinto, {
        title: 'Fotos con luces de neón sobre el grano',
        campaignId,
      });
      return GuardianReportResponseSchema.parse(
        (
          await jhon.agent
            .post(`${base(tinto)}/guardian/evaluate`)
            .send({ resourceType: 'content_item', resourceId: item.id })
            .expect(201)
        ).body,
      ).report;
    };
    const neon = (report: { findings: { code: string; title: string; message: string }[] }) =>
      report.findings.filter(
        (f) => f.code !== 'memory_exception_applied' && /ne[oó]n/i.test(`${f.title} ${f.message}`),
      );
    const reportX = await review(x.id);
    expect(neon(reportX)).toEqual([]);
    expect(reportX.findings.map((f) => f.code)).toContain('memory_exception_applied');
    const reportY = await review(y.id);
    expect(neon(reportY).length).toBeGreaterThan(0);
  });

  it('una memoria nunca fundamenta un claim: el Guardian sigue bloqueando "somos el #1"', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    // Aunque existiera como texto (insertado a mano, saltándose el filtro), no es un hecho.
    await CreativeMemoryModel.create({
      workspaceId: tinto,
      memoryScope: 'enterprise',
      kind: 'preference',
      content: 'Podemos decir que somos el café #1 del Cauca',
      createdByUserId: jhon.user.id,
      active: true,
      status: 'active',
      origin: 'explicit',
      dimension: 'other',
      normalizedKey: 'other:cafe_cauca:prefer',
      polarity: 'prefer',
      scope: { type: 'workspace', id: null, label: null },
      confidence: 0.95,
      confirmedByUser: true,
    });
    const report = GuardianReportResponseSchema.parse(
      (
        await jhon.agent
          .post(`${base(tinto)}/guardian/evaluate`)
          .send({ resourceType: 'copy', content: 'Somos el café #1 del Cauca' })
          .expect(201)
      ).body,
    ).report;
    expect(report.status).toBe('block');
  });
});

describe('Personal', () => {
  it('"Recuerda que prefiero carruseles educativos" orienta el próximo plan', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const me = await personal(jhon);
    const withoutMemory = await plan(jhon, me, { platforms: undefined });
    expect(new Set(withoutMemory.items.map((item) => item.format)).size).toBeGreaterThan(1);
    await rememberByCommand(jhon, me, 'Recuerda que prefiero carruseles educativos');
    const [memory] = await memories(jhon, me, 'active');
    expect(memory).toMatchObject({
      contextType: 'personal',
      normalizedKey: 'format:carousel:prefer',
    });
    expect(memory!.statement).toMatch(/contenido educativo/);
    const withMemory = await plan(jhon, me, { platforms: undefined });
    expect(withMemory.items.every((item) => item.format === 'carousel')).toBe(true);
    expect(withMemory.plan.generation!.memoryKeys).toContain('format:carousel:prefer');
  });

  it('Daily Director: solo memorias de forma de trabajar (máximo de prioridades), nunca visuales', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const me = await personal(jhon);
    for (const title of [
      'Editar reel',
      'Enviar propuesta',
      'Revisar guion',
      'Preparar moodboard',
    ]) {
      await createTask(jhon, me, { title, priority: 'high', dueDate: daysFromNow(0) });
    }
    const generate = async () =>
      DailyBriefResponseSchema.parse(
        (await jhon.agent.post(`${base(me)}/daily-brief/generate`).expect(201)).body,
      ).brief;
    expect((await generate()).priorities.length).toBe(3);
    await remember(jhon, me, 'Prefiero máximo 2 prioridades al día');
    await remember(jhon, me, 'Prefiero iluminación cálida en las fotos');
    const workflow = await resolveCreativeMemories(await workspaceDoc(me), {
      dimensions: ['workflow'],
    });
    expect(workflow.memories.map((m) => m.normalizedKey)).toEqual([
      'workflow:max_priorities:prefer',
    ]);
    const brief = await generate();
    expect(brief.priorities.map((p) => p.rank)).toEqual([1, 2]);
  });
});

describe('Aislamiento', () => {
  it('mismo dueño: la memoria de TINTO nunca aparece ni afecta a INVENTIA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const nova = await brand(jhon, 'Inventia', inventia);
    const memory = await remember(jhon, tinto, 'De ahora en adelante evita las Stories');
    expect(await memories(jhon, nova)).toEqual([]);
    await jhon.agent.get(`${base(nova)}/creative-memories/${memory.id}`).expect(404);
    await jhon.agent.post(`${base(nova)}/creative-memories/${memory.id}/forget`).expect(404);
    expect((await resolveCreativeMemories(await workspaceDoc(nova))).memories).toEqual([]);
    const novaPlan = await plan(jhon, nova, {});
    expect(novaPlan.plan.generation!.memoryKeys).toEqual([]);
    const shown = await command(jhon, nova, '¿Qué has aprendido de Inventia?');
    expect(shown.reply).not.toContain('Stories');

    const ana = await registerUser(app, 'Ana');
    await ana.agent.get(`${base(tinto)}/creative-memories`).expect(404);
    await ana.agent.get(`${base(tinto)}/creative-memories/${memory.id}`).expect(404);
  });
});

describe('Ciclo de vida por API y migración', () => {
  it('reemplazar = nueva memoria (la anterior queda en el historial); errores claros', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const memory = await remember(jhon, tinto, 'De ahora en adelante evita las Stories');
    const res = await jhon.agent
      .post(`${base(tinto)}/creative-memories/${memory.id}/replace`)
      .send({ text: 'Evita las Stories salvo en lanzamientos' })
      .expect(201);
    const replaced = CreativeMemoryActionResponseSchema.parse(res.body).memory;
    expect(replaced).toMatchObject({ status: 'active', supersedesMemoryId: memory.id });
    const detail = CreativeMemoryResponseSchema.parse(
      (await jhon.agent.get(`${base(tinto)}/creative-memories/${memory.id}`).expect(200)).body,
    );
    expect(detail.memory.status).toBe('superseded');
    expect(detail.related.map((m) => m.id)).toEqual([replaced.id]);
    const conflict = await jhon.agent
      .post(`${base(tinto)}/creative-memories/${memory.id}/forget`)
      .expect(409);
    expect(conflict.body.error.details.reason).toBe('creative_memory_not_active');
  });

  it('migración: lo anterior queda legacy (idempotente) y fuera de la página y del retrieval', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    await CreativeMemoryModel.collection.insertOne({
      workspaceId: CreativeMemoryModel.castObject({ workspaceId: tinto }).workspaceId,
      memoryScope: 'enterprise',
      kind: 'insight',
      content: 'Texto libre anterior',
      source: { type: 'manual', conversationId: null, messageId: null },
      createdByUserId: CreativeMemoryModel.castObject({ createdByUserId: jhon.user.id })
        .createdByUserId,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await migrateLegacyCreativeMemories({ dryRun: true })).toEqual({
      pending: 1,
      migrated: 0,
    });
    expect(await migrateLegacyCreativeMemories()).toEqual({ pending: 1, migrated: 1 });
    expect(await migrateLegacyCreativeMemories()).toEqual({ pending: 0, migrated: 0 });
    const legacy = await CreativeMemoryModel.findOne({ workspaceId: tinto });
    expect(legacy).toMatchObject({
      status: 'legacy',
      active: false,
      content: 'Texto libre anterior',
    });
    expect(await memories(jhon, tinto)).toEqual([]);
    expect((await resolveCreativeMemories(await workspaceDoc(tinto))).memories).toEqual([]);
  });
});
