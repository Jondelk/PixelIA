import {
  GuardianReportSchema,
  PixelCommandSchema,
  type GuardianPreflightSummary,
  type GuardianReport,
} from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { workspaceNav } from '../../app/navigation';
import { PixelCommandPanel } from '../pixel-command/PixelCommand';
import { canApply, canCorrect, preflightHeadline, sortFindings } from './guardianLogic';
import { GuardianReportView } from './GuardianReportView';

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ID = '6ac93cc3a738fe62abe5b039';
const NOW = '2026-10-10T12:00:00.000Z';

const promo = {
  id: 'F1',
  evaluator: 'claims',
  dimension: 'claims',
  severity: 'critical',
  blocking: true,
  code: 'invented_promotion',
  title: 'Promoción que la marca no ha dado',
  message:
    'El texto anuncia «20% de descuento», pero ni el ADN ni la campaña recogen esa promoción.',
  evidence: ['Texto: «¡Compra YA con 20% de descuento!»'],
  brandEvidence: ['ADN, campaña y datos confirmados: no registran esta afirmación'],
  recommendation: 'Quita la promoción o añádela como dato confirmado.',
  canAutoFix: true,
  canOverride: false,
  overridden: false,
} as const;

const tone = {
  ...promo,
  id: 'F2',
  evaluator: 'communication',
  dimension: 'communication',
  severity: 'high',
  blocking: false,
  code: 'aggressive_tone',
  title: 'El tono es más agresivo que el de la marca',
  message: 'El texto usa presión de urgencia.',
  brandEvidence: ['ADN → Comunicación → tono: cálido', 'ADN → Comunicación → tono: cercano'],
  recommendation: 'Usa una invitación menos urgente.',
  canOverride: true,
} as const;

function reportFixture(overrides: Partial<GuardianReport> = {}): GuardianReport {
  return GuardianReportSchema.parse({
    id: ID,
    workspaceId: ID,
    contextType: 'enterprise',
    mode: 'copy',
    resourceType: 'copy',
    resourceId: null,
    resourceLabel: 'Texto pegado',
    brandDnaVersion: 1,
    campaignId: null,
    campaignStrategyVersion: null,
    status: 'block',
    score: 74,
    dimensions: [
      {
        dimension: 'communication',
        applicable: true,
        score: 75,
        status: 'warning',
        summary: null,
        findingIds: ['F2'],
      },
      {
        dimension: 'claims',
        applicable: true,
        score: 60,
        status: 'block',
        summary: null,
        findingIds: ['F1'],
      },
      {
        dimension: 'visual_direction',
        applicable: false,
        score: null,
        status: 'pass',
        summary: null,
        findingIds: [],
      },
    ],
    findings: [tone, promo],
    summary:
      'Antes de usarlo hay que resolver: promoción que la marca no ha dado; el tono es más agresivo.',
    generation: {
      deterministic: true,
      aiUsed: false,
      provider: 'demo',
      model: 'demo',
      mode: 'demo',
    },
    correction: null,
    sourceSnapshotHash: 'abc',
    stale: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('GuardianReportView', () => {
  it('el score nunca va solo: estado, dimensiones aplicables y hallazgos explicados', () => {
    const plain = text(render(<GuardianReportView report={reportFixture()} />));
    expect(plain).toContain('74 / 100');
    expect(plain).toContain('no una medida científica');
    expect(plain).toContain('Resolver antes de continuar');
    expect(plain).toContain('Comunicación');
    expect(plain).toContain('Afirmaciones');
    // Una dimensión que no aplica no aparece (ni penaliza).
    expect(plain).not.toContain('Dirección visual');
    expect(plain).toContain('Basado en');
    expect(plain).toContain('ADN → Comunicación → tono: cálido');
    expect(plain).toContain('Recomendación:');
    expect(plain).toContain('Solo se revisan textos y descripciones: ninguna imagen');
  });

  it('lo que bloquea va primero; lo factual no se puede pasar por alto', () => {
    const html = render(
      <GuardianReportView report={reportFixture()} actions={{ onOverride: () => {} }} />,
    );
    const plain = text(html);
    expect(plain.indexOf('Promoción que la marca no ha dado')).toBeLessThan(
      plain.indexOf('El tono es más agresivo'),
    );
    expect(plain).toContain('Es integridad factual');
    // Solo el hallazgo creativo ofrece continuar.
    expect(plain.match(/Continuar de todas formas/g)).toHaveLength(1);
  });

  it('«Corregir con Pixel» solo con hallazgos corregibles; la corrección se compara antes de aplicarla', () => {
    const report = reportFixture();
    expect(canCorrect(report)).toBe(true);
    expect(
      text(render(<GuardianReportView report={report} actions={{ onCorrect: () => {} }} />)),
    ).toContain('Corregir con Pixel');

    const corrected = reportFixture({
      resourceType: 'content_item',
      resourceId: ID,
      status: 'pass',
      findings: [],
      correction: {
        fromReportId: ID,
        fields: [
          {
            field: 'title',
            label: 'Título',
            original: '¡Compra YA con 20% de descuento!',
            corrected: 'Descubre el origen de cada taza.',
          },
        ],
        changes: ['Quité una promoción que la marca no ha dado.'],
        appliedAt: null,
      },
    });
    expect(canCorrect(corrected)).toBe(false);
    expect(canApply(corrected)).toBe(true);
    const plain = text(
      render(<GuardianReportView report={corrected} actions={{ onApply: () => {} }} />),
    );
    expect(plain).toContain('Original · Título');
    expect(plain).toContain('Propuesta corregida');
    expect(plain).toContain('Aplicar corrección');
    // Un texto pegado no se aplica: se copia.
    expect(canApply({ ...corrected, resourceType: 'copy' })).toBe(false);
  });

  it('informe desactualizado: lo dice y ofrece revisar de nuevo (sin regenerar solo)', () => {
    const plain = text(
      render(
        <GuardianReportView
          report={reportFixture({ stale: true })}
          actions={{ onReviewAgain: () => {} }}
        />,
      ),
    );
    expect(plain).toContain('Este recurso cambió después de esta revisión.');
    expect(plain).toContain('Revisar nuevamente');
  });

  it('orden y líneas compactas', () => {
    expect(sortFindings([tone, promo]).map((finding) => finding.id)).toEqual(['F1', 'F2']);
    expect(preflightHeadline('pass', 0)).toBe('Coherente con la marca');
    expect(preflightHeadline('warning', 1)).toBe('1 ajuste recomendado');
    expect(preflightHeadline('block', 2)).toMatch(/Guardian encontró 2 cosas/);
    expect(preflightHeadline('block', 4, 1)).toBe(
      'Guardian encontró 1 cosa que resolver antes de organizar · 3 recomendaciones',
    );
  });
});

function commandWith(guardian: GuardianPreflightSummary | null) {
  return PixelCommandSchema.parse({
    id: ID,
    workspaceId: ID,
    status: 'proposed',
    intent: 'create_campaign',
    request: 'Quiero lanzar un café instantáneo de TINTO.',
    source: 'text',
    turns: [],
    question: null,
    reply: 'Entendí que quieres lanzar un café instantáneo.',
    guardian,
    plan: {
      intent: 'create_campaign',
      summary: 'Entendí que quieres lanzar un café instantáneo.',
      understood: ['Qué: café instantáneo'],
      proposal: ['Una campaña'],
      creates: ['Una campaña con su estrategia'],
      steps: [],
      requiresConfirmation: true,
      revision: 1,
    },
    interpretation: { mode: 'demo', confidence: 0.75 },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const preflight = (
  status: GuardianPreflightSummary['status'],
  canOverride: boolean,
): GuardianPreflightSummary => ({
  reportId: ID,
  status,
  score: 80,
  findings:
    status === 'pass'
      ? []
      : [
          {
            id: 'F1',
            severity: 'high',
            blocking: status === 'block',
            title: 'Contradice una restricción explícita de la marca',
            message: 'La marca dejó escrito «No mostrar café instantáneo».',
            recommendation: 'Replantea esa parte.',
            canOverride,
            overridden: false,
          },
        ],
  correctionNote: null,
  overridden: false,
});

/** La etiqueta de apertura del botón «Organizar». */
const organizeButton = (html: string) =>
  [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>).)*)<\/button>/g)].find((match) =>
    match[2]!.includes('Organizar'),
  )?.[1] ?? '';

function panel(guardian: GuardianPreflightSummary | null) {
  return render(
    <PixelCommandPanel
      phase="proposal"
      command={commandWith(guardian)}
      title="¿Qué necesitas hacer?"
      placeholder="Cuéntale a Pixel…"
      base="/workspace/w1"
      error={null}
      adjusting={false}
      thinking={() => null}
      onSend={() => {}}
      onAdjust={() => {}}
      onStartAdjust={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
      onReset={() => {}}
      onGuardianOverride={() => {}}
    />,
  );
}

describe('Guardian preflight en la propuesta de Pixel', () => {
  it('PASS: línea compacta y Organizar disponible', () => {
    const html = panel(preflight('pass', true));
    expect(text(html)).toContain('Guardian · Coherente con la marca');
    expect(organizeButton(html)).not.toContain('disabled=""');
  });

  it('WARNING: el detalle se expande bajo demanda y se puede organizar', () => {
    const html = panel(preflight('warning', true));
    const plain = text(html);
    expect(plain).toContain('1 ajuste recomendado');
    expect(plain).toContain('Ver detalle');
    expect(plain).not.toContain('Replantea esa parte.');
    expect(plain).not.toContain('Continuar de todas formas');
  });

  it('BLOCK creativo: Organizar desactivado y «Continuar de todas formas»', () => {
    const html = panel(preflight('block', true));
    expect(text(html)).toContain('Continuar de todas formas');
    expect(organizeButton(html)).toContain('disabled=""');
  });

  it('BLOCK factual: sin override posible', () => {
    const plain = text(panel(preflight('block', false)));
    expect(plain).not.toContain('Continuar de todas formas');
    expect(plain).toContain('Resuélvelo con «Ajustar»');
  });

  it('Personal no ve Brand Guardian en la navegación', () => {
    const labels = workspaceNav('w1', 'personal').flatMap((group) =>
      group.items.map((item) => item.label),
    );
    expect(labels).not.toContain('Brand Guardian');
  });
});
