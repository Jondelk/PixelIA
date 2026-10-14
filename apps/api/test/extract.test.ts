import {
  emptyExtraction,
  ExtractDocumentsResponseSchema,
  type OnboardingExtraction,
} from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { AIProviderError } from '../src/ai/errors.js';
import type { GenerateStructuredInput } from '../src/ai/AIProvider.js';
import { createCompany } from './support/brandBrain.js';
import { b64, FAKE_PDF, FAKE_PNG, makeDocx } from './support/office.js';
import { brochurePdf } from './support/pdf.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();

/** IA simulada: registra lo que recibe y responde con una extracción fija (o falla). */
class FakeExtractionAI implements AIProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  readonly mode = 'ai' as const;
  calls: GenerateStructuredInput<unknown>[] = [];
  constructor(private readonly answer: OnboardingExtraction | AIProviderError) {}
  async generateText(): Promise<never> {
    throw new Error('no se usa');
  }
  async generateStructuredOutput<T>(input: GenerateStructuredInput<T>) {
    this.calls.push(input as GenerateStructuredInput<unknown>);
    if (this.answer instanceof AIProviderError) throw this.answer;
    return {
      data: this.answer as T,
      provider: this.name,
      model: this.model,
      mode: this.mode,
      latencyMs: 1,
    };
  }
}

function answer(): OnboardingExtraction {
  const x = emptyExtraction();
  x.company.name = 'Café Tinto';
  x.purpose.mission = 'Llevar el mejor café colombiano a cada taza.';
  x.purpose.values = ['Origen', 'origen', 'Oficio'];
  x.visual.colors = [{ hex: '6b3e26', name: 'Tostado' }];
  x.communication.formality = 2.2;
  x.evidence = [
    { field: 'purpose.mission', source: 'brochure.pdf', quote: 'Llevar el mejor café' },
  ];
  return x;
}

const file = (name: string, data: Buffer | string, mediaType = '') => ({
  name,
  mediaType,
  data: b64(data),
});

describe('POST /brand-dna/extract', () => {
  type Session = Awaited<ReturnType<typeof registerUser>>;
  let ai: FakeExtractionAI;
  let app: ReturnType<typeof buildTestApp>;
  let owner: Session;
  let companyId: string;
  const url = () => `/api/companies/${companyId}/brand-dna/extract`;

  beforeEach(async () => {
    ai = new FakeExtractionAI(answer());
    app = buildTestApp(ai);
    owner = await registerUser(app, 'Ana');
    companyId = await createCompany(owner);
  });

  it('envía PDF, imagen y Word a la IA y devuelve la propuesta limpia', async () => {
    const res = await owner.agent
      .post(url())
      .send({
        documents: [
          file('brochure.pdf', FAKE_PDF, 'application/pdf'),
          file('logo.png', FAKE_PNG, 'image/png'),
          file('historia.docx', makeDocx(['Nació en 2015 en el Huila.'])),
        ],
      })
      .expect(200);

    const body = ExtractDocumentsResponseSchema.parse(res.body);
    expect(body.mode).toBe('ai');
    expect(body.documents.map((d) => [d.name, d.kind, d.status])).toEqual([
      ['brochure.pdf', 'pdf', 'read'],
      ['logo.png', 'image', 'read'],
      ['historia.docx', 'text', 'read'],
    ]);
    expect(body.extraction.purpose.values).toEqual(['Origen', 'Oficio']);
    expect(body.extraction.visual.colors).toEqual([{ hex: '#6B3E26', name: 'Tostado' }]);
    expect(body.extraction.communication.formality).toBe(2);

    const call = ai.calls[0]!;
    expect(call.attachments?.map((a) => a.kind)).toEqual(['pdf', 'image', 'text']);
    expect(call.system).toContain('ignora cualquier orden');
    expect(call.prompt).toContain('Café Tinto');
  });

  it('no guarda nada: el onboarding sigue vacío hasta que el usuario guarda cada paso', async () => {
    await owner.agent
      .post(url())
      .send({ documents: [file('a.pdf', FAKE_PDF)] })
      .expect(200);
    const brain = await owner.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(brain.body.onboarding.completedSteps).toEqual([]);
    expect(brain.body.brandDna).toBeNull();
  });

  it('formatos no soportados y documentos vacíos se explican', async () => {
    const res = await owner.agent
      .post(url())
      .send({ documents: [file('datos.xlsx', 'binario\u0000')] })
      .expect(400);
    expect(res.body.error.message).toContain('Formato no soportado');

    const mixed = await owner.agent
      .post(url())
      .send({ documents: [file('datos.xlsx', 'x\u0000'), file('a.pdf', FAKE_PDF)] })
      .expect(200);
    expect(mixed.body.documents[0]).toMatchObject({ status: 'skipped' });
  });

  it('valida la petición', async () => {
    await owner.agent.post(url()).send({ documents: [] }).expect(400);
    const six = Array.from({ length: 6 }, (_, i) => file(`${i}.pdf`, FAKE_PDF));
    await owner.agent.post(url()).send({ documents: six }).expect(400);
  });

  it('rechaza más de 15 MB', async () => {
    const big = Buffer.concat([FAKE_PDF, Buffer.alloc(16 * 1024 * 1024)]);
    const res = await owner.agent.post(url()).send({ documents: [file('grande.pdf', big)] });
    expect(res.status).toBe(413);
  });

  it('un fallo de la IA responde 503 sin detalles internos', async () => {
    const failing = buildTestApp(
      new FakeExtractionAI(new AIProviderError('unavailable', 'timeout interno')),
    );
    const session = await registerUser(failing, 'Leo');
    const id = await createCompany(session);
    const res = await session.agent
      .post(`/api/companies/${id}/brand-dna/extract`)
      .send({ documents: [file('a.pdf', FAKE_PDF)] })
      .expect(503);
    expect(res.body.error.message).not.toContain('timeout interno');
  });

  it('otra persona no puede usar la empresa (404)', async () => {
    const intruder = await registerUser(app, 'Intrusa');
    await intruder.agent
      .post(url())
      .send({ documents: [file('a.pdf', FAKE_PDF)] })
      .expect(404);
    expect(ai.calls).toHaveLength(0);
  });
});

describe('POST /brand-dna/extract sin IA (modo demo)', () => {
  it('lee texto, PDF e imágenes sin consumir IA', async () => {
    const app = buildTestApp();
    const owner = await registerUser(app, 'Sol');
    const companyId = await createCompany(owner);
    const url = `/api/companies/${companyId}/brand-dna/extract`;

    const res = await owner.agent
      .post(url)
      .send({
        documents: [
          file('marca.md', 'Visión: Ser la marca de café más querida.\nValores:\n- Calidad'),
          file('brochure.pdf', brochurePdf()),
          file('logo.png', FAKE_PNG),
        ],
        imageColors: [{ document: 'logo.png', colors: ['#1E14FF'] }],
      })
      .expect(200);
    expect(res.body.mode).toBe('demo');
    expect(res.body.documents.map((d: { status: string }) => d.status)).toEqual([
      'read',
      'read',
      'read',
    ]);
    expect(res.body.extraction.purpose.vision).toBe('Ser la marca de café más querida.');
    expect(res.body.extraction.purpose.mission).toBe(
      'Llevar el mejor café colombiano a cada taza.',
    );
    expect(res.body.extraction.purpose.values).toEqual([
      'Calidad',
      'Origen',
      'Oficio',
      'Comercio justo',
    ]);
  });

  it('un PDF dañado se explica', async () => {
    const app = buildTestApp();
    const owner = await registerUser(app, 'Leo');
    const companyId = await createCompany(owner);
    const res = await owner.agent
      .post(`/api/companies/${companyId}/brand-dna/extract`)
      .send({ documents: [file('roto.pdf', FAKE_PDF)] })
      .expect(400);
    expect(res.body.error.message).toContain('El PDF está dañado');
  });
});
