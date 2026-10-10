import {
  CampaignGenerationResponseSchema,
  GuardianReportListResponseSchema,
  GuardianReportResponseSchema,
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type GeneratedPixelInterpretation,
  type GuardianReport,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { CampaignModel } from '../src/modules/campaigns/campaign.model.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { GuardianReportModel } from '../src/modules/guardian/guardianReport.model.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { creativeDirector } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createContent } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();

/** DemoProvider que cuenta las llamadas estructuradas del Guardian (abrir un informe no debe llamar). */
class CountingProvider extends DemoProvider {
  guardianCalls = 0;
  override async generateStructuredOutput<T>(
    ...args: Parameters<AIProvider['generateStructuredOutput']>
  ) {
    if (args[0].schemaName.startsWith('guardian_')) this.guardianCalls += 1;
    return super.generateStructuredOutput<T>(...(args as [never]));
  }
}
const counting = new CountingProvider();
const app = buildTestApp(counting);

type Session = Awaited<ReturnType<typeof registerUser>>;
const guardian = (workspaceId: string) => `/api/workspaces/${workspaceId}/guardian`;
const commands = (workspaceId: string) => `/api/workspaces/${workspaceId}/pixel/commands`;

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return (await workspaceIdOf(companyId)).toString();
}

async function evaluate(session: Session, workspaceId: string, body: object, status = 201) {
  const res = await session.agent
    .post(`${guardian(workspaceId)}/evaluate`)
    .send(body)
    .expect(status);
  return status === 201 ? GuardianReportResponseSchema.parse(res.body).report : res.body;
}

const copy = (content: string, extra: object = {}) => ({ resourceType: 'copy', content, ...extra });

describe('Revisión manual y persistencia', () => {
  it('revisa un texto pegado, lo guarda y abrirlo no vuelve a llamar a la IA', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const report: GuardianReport = await evaluate(
      jhon,
      tinto,
      copy('¡Compra YA el café #1 del Cauca con 20% de descuento!'),
    );
    expect(report.status).toBe('block');
    expect(report.contextType).toBe('enterprise');
    expect(report.brandDnaVersion).toBe(1);
    expect(report.findings.every((finding) => finding.brandEvidence.length > 0)).toBe(true);
    // El texto pegado no se convierte en contenido.
    expect(await ContentItemModel.countDocuments({ workspaceId: tinto })).toBe(0);
    const calls = counting.guardianCalls;
    const res = await jhon.agent.get(`${guardian(tinto)}/reports/${report.id}`).expect(200);
    expect(GuardianReportResponseSchema.parse(res.body).report).toMatchObject({
      id: report.id,
      score: report.score,
      stale: false,
    });
    expect(counting.guardianCalls).toBe(calls);
    const list = GuardianReportListResponseSchema.parse(
      (await jhon.agent.get(`${guardian(tinto)}/reports?resourceType=copy`).expect(200)).body,
    );
    expect(list.total).toBe(1);
  });

  it('contenido: si cambia después de la revisión, el informe queda desactualizado (sin regenerar)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const item = await createContent(jhon, tinto, {
      title: 'Del origen a tu taza',
      concept: 'El recorrido del grano desde la finca.',
    });
    const report: GuardianReport = await evaluate(jhon, tinto, {
      resourceType: 'content_item',
      resourceId: item.id,
    });
    expect(report.resourceLabel).toBe('Del origen a tu taza');
    await jhon.agent
      .patch(`/api/workspaces/${tinto}/content/${item.id}`)
      .send({ title: 'Otro título' })
      .expect(200);
    const res = await jhon.agent.get(`${guardian(tinto)}/reports/${report.id}`).expect(200);
    const after = GuardianReportResponseSchema.parse(res.body).report;
    expect(after.stale).toBe(true);
    expect(after.summary).toBe(report.summary);
  });

  it('campaña: revisa campaña + estrategia vigente; filtra por recurso', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = CampaignGenerationResponseSchema.parse(
      (
        await jhon.agent
          .post(`/api/workspaces/${tinto}/campaigns/generate`)
          .send({
            name: 'Lanzamiento TINTO 500 g',
            objective: 'Presentar la nueva presentación de 500 g.',
            channels: ['Instagram'],
          })
          .expect(201)
      ).body,
    );
    const report: GuardianReport = await evaluate(jhon, tinto, {
      resourceType: 'campaign',
      resourceId: campaign.id,
    });
    expect(report.campaignStrategyVersion).toBe(1);
    expect(
      report.dimensions.find((entry) => entry.dimension === 'visual_direction')?.applicable,
    ).toBe(true);
    expect(report.status).not.toBe('block');
    const list = GuardianReportListResponseSchema.parse(
      (await jhon.agent.get(`${guardian(tinto)}/reports?resourceId=${campaign.id}`).expect(200))
        .body,
    );
    expect(list.reports.map((entry) => entry.id)).toEqual([report.id]);
    // Revisar no cambia la campaña.
    expect(
      (await CampaignModel.findOne({ _id: campaign.id, workspaceId: tinto }).lean())
        ?.currentStrategyVersion,
    ).toBe(1);
  });
});

describe('Override y corrección (una sola pasada)', () => {
  it('override solo en lo creativo; lo factual se corrige o se aporta', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const restriction: GuardianReport = await evaluate(
      jhon,
      tinto,
      copy('Un tutorial para preparar café instantáneo en casa.'),
    );
    expect(restriction.status).toBe('block');
    const finding = restriction.findings.find((item) => item.code === 'explicit_restriction')!;
    const res = await jhon.agent
      .post(`${guardian(tinto)}/reports/${restriction.id}/override`)
      .send({ findingId: finding.id })
      .expect(200);
    const overridden = GuardianReportResponseSchema.parse(res.body).report;
    expect(overridden.findings.find((item) => item.id === finding.id)?.overridden).toBe(true);
    expect(overridden.status).not.toBe('block');
    expect(overridden.score).toBe(restriction.score);

    const promo: GuardianReport = await evaluate(
      jhon,
      tinto,
      copy('Llévate TINTO con 20% de descuento.'),
    );
    const factual = promo.findings.find((item) => item.code === 'invented_promotion')!;
    const refused = await jhon.agent
      .post(`${guardian(tinto)}/reports/${promo.id}/override`)
      .send({ findingId: factual.id })
      .expect(409);
    expect(refused.body.error.details.reason).toBe('guardian_not_overridable');
  });

  it('«Corregir con Pixel» quita la promoción inventada (no la cambia por otra) y re-evalúa una vez', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const original: GuardianReport = await evaluate(
      jhon,
      tinto,
      copy('¡Compra YA el café #1 del Cauca con 20% de descuento!'),
    );
    const res = await jhon.agent
      .post(`${guardian(tinto)}/reports/${original.id}/correct`)
      .expect(201);
    const corrected = GuardianReportResponseSchema.parse(res.body).report;
    const text = corrected.correction!.fields[0]!.corrected;
    expect(text).not.toMatch(/descuento|%|#1|Cauca|YA/);
    expect(corrected.correction?.fromReportId).toBe(original.id);
    const found = corrected.findings.map((item) => item.code);
    expect(found).not.toContain('invented_promotion');
    expect(found).not.toContain('ungrounded_market_claim');
    expect(corrected.status).not.toBe('block');
    // Máximo una pasada: la corrección no se corrige otra vez.
    const again = await jhon.agent
      .post(`${guardian(tinto)}/reports/${corrected.id}/correct`)
      .expect(409);
    expect(again.body.error.details.reason).toBe('guardian_single_correction_pass');
    // Un texto pegado no se aplica a ningún recurso.
    await jhon.agent.post(`${guardian(tinto)}/reports/${corrected.id}/apply`).expect(400);
  });

  it('aplicar una corrección a un contenido usa su servicio, solo tras confirmarlo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const item = await createContent(jhon, tinto, { title: 'Llévate TINTO con 20% de descuento' });
    const original: GuardianReport = await evaluate(jhon, tinto, {
      resourceType: 'content_item',
      resourceId: item.id,
    });
    const corrected = GuardianReportResponseSchema.parse(
      (await jhon.agent.post(`${guardian(tinto)}/reports/${original.id}/correct`).expect(201)).body,
    ).report;
    // Proponer la corrección no toca el contenido.
    expect(
      (await ContentItemModel.findOne({ _id: item.id, workspaceId: tinto }).lean())?.title,
    ).toBe('Llévate TINTO con 20% de descuento');
    const applied = GuardianReportResponseSchema.parse(
      (await jhon.agent.post(`${guardian(tinto)}/reports/${corrected.id}/apply`).expect(200)).body,
    ).report;
    expect(applied.correction?.appliedAt).not.toBeNull();
    expect(
      (await ContentItemModel.findOne({ _id: item.id, workspaceId: tinto }).lean())?.title,
    ).not.toMatch(/descuento/);
    const stale = GuardianReportResponseSchema.parse(
      (await jhon.agent.get(`${guardian(tinto)}/reports/${original.id}`).expect(200)).body,
    ).report;
    expect(stale.stale).toBe(true);
  });
});

describe('Aislamiento y capacidades', () => {
  it('TINTO no puede revisar contenido de INVENTIA (mismo dueño) ni leer sus informes', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const labItem = await createContent(jhon, lab, { title: 'Prototipo capa a capa' });
    const res = await evaluate(
      jhon,
      tinto,
      { resourceType: 'content_item', resourceId: labItem.id },
      404,
    );
    expect(JSON.stringify(res)).not.toMatch(/Prototipo/);
    const labReport: GuardianReport = await evaluate(jhon, lab, copy('Iteración a iteración.'));
    await jhon.agent.get(`${guardian(tinto)}/reports/${labReport.id}`).expect(404);
    await jhon.agent.post(`${guardian(tinto)}/reports/${labReport.id}/correct`).expect(404);
  });

  it('otro usuario recibe 404', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ana = await registerUser(app, 'Ana');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const report: GuardianReport = await evaluate(
      jhon,
      tinto,
      copy('Conoce el origen que acompaña cada taza.'),
    );
    await ana.agent.get(`${guardian(tinto)}/reports/${report.id}`).expect(404);
    await ana.agent
      .post(`${guardian(tinto)}/evaluate`)
      .send(copy('x'))
      .expect(404);
  });

  it('Personal: Brand Guardian no está disponible', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, personal, creativeDirector);
    const res = await jhon.agent
      .post(`${guardian(personal)}/evaluate`)
      .send(copy('Hola'))
      .expect(400);
    expect(res.body.error.details.reason).toBe('feature_not_available');
    // PixelCommand Personal no ejecuta preflight.
    const command = PixelCommandResponseSchema.parse(
      (
        await jhon.agent
          .post(commands(personal))
          .send({ request: 'Necesito publicar algo esta semana sobre Pixel.' })
          .expect(201)
      ).body,
    ).command;
    expect(command.guardian).toBeNull();
  });
});

/** Proveedor cuyo intérprete añade al objetivo una promoción que el usuario no dijo. */
class InventingProvider extends DemoProvider {
  override async generateStructuredOutput<T>(
    ...args: Parameters<AIProvider['generateStructuredOutput']>
  ) {
    const result = await super.generateStructuredOutput<T>(...(args as [never]));
    if (args[0].schemaName !== 'pixel_command_interpretation') return result;
    const data = result.data as unknown as GeneratedPixelInterpretation;
    if (data.intent !== 'create_campaign') return result;
    return {
      ...result,
      data: {
        ...data,
        entities: { ...data.entities, objective: 'Lanzar TINTO 500 g con 20% de descuento' },
      } as T,
    };
  }
}

describe('PixelCommand + Guardian preflight', () => {
  it('propuesta válida → Guardian sin BLOCK y se puede organizar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = PixelCommandResponseSchema.parse(
      (
        await jhon.agent
          .post(commands(tinto))
          .send({ request: 'Quiero lanzar TINTO 500 g la próxima semana en Instagram.' })
          .expect(201)
      ).body,
    ).command;
    expect(command.guardian?.status).not.toBe('block');
    expect(command.guardian?.reportId).toBeTruthy();
    const confirmed = PixelCommandConfirmResponseSchema.parse(
      (
        await jhon.agent
          .post(`${commands(tinto)}/${command.id}/confirm`)
          .send({ revision: command.plan!.revision })
          .expect(200)
      ).body,
    );
    expect(confirmed.command.status).toBe('completed');
  });

  it('BLOCK creativo (restricción explícita): no se organiza hasta resolverlo; continuar queda registrado', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = PixelCommandResponseSchema.parse(
      (
        await jhon.agent
          .post(commands(tinto))
          .send({ request: 'Quiero lanzar un café instantáneo de TINTO la próxima semana.' })
          .expect(201)
      ).body,
    ).command;
    expect(command.guardian?.status).toBe('block');
    const blocked = await jhon.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(409);
    expect(blocked.body.error.details.reason).toBe('guardian_preflight_blocked');
    expect(await CampaignModel.countDocuments({ workspaceId: tinto })).toBe(0);

    const overridden = PixelCommandResponseSchema.parse(
      (await jhon.agent.post(`${commands(tinto)}/${command.id}/guardian-override`).expect(200))
        .body,
    ).command;
    expect(overridden.guardian?.overridden).toBe(true);
    const report = await GuardianReportModel.findOne({
      _id: command.guardian!.reportId,
      workspaceId: tinto,
    }).lean();
    expect(report?.findings.some((finding) => finding.overridden && finding.overriddenAt)).toBe(
      true,
    );
    await jhon.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    expect(await CampaignModel.countDocuments({ workspaceId: tinto })).toBe(1);
  });

  it('Pixel se corrige a sí mismo: quita la promoción inventada y re-evalúa una sola vez', async () => {
    const inventing = buildTestApp(new InventingProvider());
    const jhon = await registerUser(inventing, 'Jhon');
    const companyId = await createCompany(jhon, 'Café Tinto');
    await completeOnboarding(jhon, companyId, cafeTinto);
    const tinto = (await workspaceIdOf(companyId)).toString();
    const command = PixelCommandResponseSchema.parse(
      (
        await jhon.agent
          .post(commands(tinto))
          .send({ request: 'Quiero lanzar TINTO 500 g la próxima semana.' })
          .expect(201)
      ).body,
    ).command;
    expect(command.guardian?.correctionNote).toMatch(/Antes de mostrarte la propuesta ajusté/);
    expect(command.guardian?.status).not.toBe('block');
    expect(command.guardian?.findings.map((finding) => finding.title).join(' ')).not.toMatch(
      /Promoción/,
    );
    expect(JSON.stringify(command.plan)).not.toMatch(/20 ?%|de descuento/);
    // Una pasada de corrección + una re-evaluación: exactamente dos informes.
    expect(
      await GuardianReportModel.countDocuments({
        workspaceId: tinto,
        resourceType: 'pixel_proposal',
      }),
    ).toBe(2);
    await jhon.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    const campaign = await CampaignModel.findOne({ workspaceId: tinto }).lean();
    expect(campaign?.objective).not.toMatch(/descuento/);
  });

  it('las consultas de solo lectura no pasan por el Guardian', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const before = await GuardianReportModel.countDocuments({ workspaceId: tinto });
    const command = PixelCommandResponseSchema.parse(
      (await jhon.agent.post(commands(tinto)).send({ request: '¿Cómo vamos?' }).expect(201)).body,
    ).command;
    expect(command.guardian).toBeNull();
    expect(await GuardianReportModel.countDocuments({ workspaceId: tinto })).toBe(before);
  });
});

describe('Plan de contenido', () => {
  it('revisa la estrategia y las piezas del plan en un solo informe, contra su campaña', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = CampaignGenerationResponseSchema.parse(
      (
        await jhon.agent
          .post(`/api/workspaces/${tinto}/campaigns/generate`)
          .send({
            name: 'Lanzamiento TINTO 500 g',
            objective: 'Presentar la nueva presentación de 500 g.',
            channels: ['Instagram'],
          })
          .expect(201)
      ).body,
    );
    const plan = (
      await jhon.agent
        .post(`/api/workspaces/${tinto}/content-plans/generate`)
        .send({
          startDate: '2026-10-19',
          endDate: '2026-10-25',
          frequency: 3,
          platforms: ['instagram'],
          tzOffset: 300,
          campaignId: campaign.id,
        })
        .expect(201)
    ).body.plan as { id: string };
    const report: GuardianReport = await evaluate(jhon, tinto, {
      resourceType: 'content_plan',
      resourceId: plan.id,
    });
    expect(report.mode).toBe('content_plan');
    expect(report.campaignId).toBe(campaign.id);
    const applicable = report.dimensions
      .filter((entry) => entry.applicable)
      .map((entry) => entry.dimension);
    expect(applicable).toEqual(expect.arrayContaining(['campaign_alignment', 'content', 'claims']));
    // El plan de Pixel desarrolla su campaña: sin bloqueos ni piezas fuera de la campaña.
    expect(report.status).not.toBe('block');
    expect(report.findings.map((finding) => finding.code)).not.toContain('off_campaign');
  });
});
