import {
  type AvatarPreview,
  type OperationsSummary,
  type WorkspaceOverview,
} from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coffeeProfile } from '../../test/avatarFixtures';
import { projectFixture } from '../../test/operationsFixtures';
import { presenceAfterReview } from '../guardian/guardianLogic';
import { isEmptyWork } from '../operations/emptyWork';
import { presenceAfterCommand, spokenFor } from '../pixel-command/commandLogic';
import { OperationsOverviewView } from '../operations/OperationsOverview';
import { WorkspaceCard } from '../workspaces/WorkspaceCard';
import { dockContextLabel, dockResourceFor, dockVisibleAt } from './dockContext';
import { PixelComposer, VoicePrivacyNotice } from './PixelComposer';
import { PixelDockView } from './PixelDock';
import { PixelPresenceAvatar } from './PixelPresenceAvatar';
import { PresenceContext, INERT_PRESENCE, type PixelPresence } from './presenceContext';
import {
  avatarStateFor,
  PRESENCE_LABELS,
  PRESENCE_STATES,
  resolveClip,
  scopeSwitchStopsVoice,
  speechFor,
  transition,
  type PixelPresenceState,
  type PresenceEvent,
} from './presenceMachine';
import { behaviorProfileOf, VOICE_PRIVACY_NOTICE, voiceProfileOf } from './presenceProfile';
import { PresenceSettingsView } from './PresenceSettings';
import {
  browserVoiceInput,
  browserVoiceOutput,
  NO_VOICE_INPUT,
  preferredVoice,
  spokenText,
  voiceCapabilities,
  type VoiceInputProvider,
} from './voice';
import { ACCENT_MIN_CONTRAST, contrastRatio, resolveAccent } from './workspaceAccent';

const render = (node: ReactNode, presence: PixelPresence = INERT_PRESENCE) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PresenceContext.Provider value={presence}>{node}</PresenceContext.Provider>
    </MemoryRouter>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ID = '6ac93cc3a738fe62abe5b039';
const NOW = '2026-10-13T12:00:00.000Z';

/** El grano de café de los tests del avatar, como vista previa (solo lo que pintan las vistas). */
function avatarFixture(overrides: Partial<AvatarPreview> = {}): AvatarPreview {
  return {
    ...coffeeProfile,
    id: ID,
    version: 1,
    ...overrides,
  } as unknown as AvatarPreview;
}

const presenceWith = (overrides: Partial<PixelPresence>): PixelPresence => ({
  ...INERT_PRESENCE,
  ...overrides,
});

describe('Presence State System', () => {
  it('flujo completo: idle → listening → thinking → speaking → idle', () => {
    const steps: PresenceEvent[] = ['listen', 'think', 'speak', 'idle'];
    const visited = steps.reduce<PixelPresenceState[]>(
      (acc, event) => [...acc, transition(acc.at(-1)!, event)],
      ['idle'],
    );
    expect(visited).toEqual(['idle', 'listening', 'thinking', 'speaking', 'idle']);
  });

  it('Guardian: thinking → reviewing → (corrección) thinking → reviewing → success/warning', () => {
    let state = transition('thinking', 'review');
    expect(state).toBe('reviewing');
    state = transition(state, 'think');
    expect(state).toBe('thinking');
    expect(transition(transition(state, 'review'), 'success')).toBe('success');
    expect(transition('reviewing', 'warn')).toBe('warning');
  });

  it('nunca queda colgado: todo vuelve a idle y el error se recupera', () => {
    for (const state of PRESENCE_STATES) expect(transition(state, 'idle')).toBe('idle');
    expect(transition(transition('thinking', 'fail'), 'think')).toBe('thinking');
    // Transiciones sin sentido se ignoran (escuchar mientras habla un fallo, hablar sin pensar…).
    expect(transition('listening', 'speak')).toBe('listening');
    expect(transition('listening', 'success')).toBe('listening');
  });

  it('cada estado tiene texto honesto (nunca solo color o movimiento)', () => {
    for (const state of PRESENCE_STATES) expect(PRESENCE_LABELS[state]).toBeTruthy();
    expect(PRESENCE_LABELS.thinking).toBe('Pensando…');
  });

  it('cambiar de Pixel corta la voz; re-ligar el mismo, no', () => {
    expect(scopeSwitchStopsVoice({ workspaceId: 'a' }, { workspaceId: 'b' })).toBe(true);
    expect(scopeSwitchStopsVoice({ workspaceId: 'a' }, null)).toBe(true);
    expect(scopeSwitchStopsVoice({ workspaceId: 'a' }, { workspaceId: 'a' })).toBe(false);
  });

  it('hablar solo en una sesión de voz, con voz activada y TTS disponible', () => {
    const on = { voiceSession: true, voiceEnabled: true, autoSpeak: true, outputSupported: true };
    expect(speechFor('Hola', on)).toBe('Hola');
    expect(speechFor('Hola', { ...on, voiceSession: false })).toBeNull();
    expect(speechFor('Hola', { ...on, autoSpeak: false })).toBeNull();
    expect(speechFor('Hola', { ...on, outputSupported: false })).toBeNull();
    expect(speechFor(null, on)).toBeNull();
  });
});

describe('Avatar runtime: poses y fallback', () => {
  it('cada estado usa una pose existente (sin inventar assets)', () => {
    expect(avatarStateFor('reviewing')).toBe('thinking');
    expect(avatarStateFor('success')).toBe('happy');
    expect(avatarStateFor('warning')).toBe('idle');
    expect(avatarStateFor('error')).toBe('idle');
    expect(avatarStateFor('listening')).toBe('listening');
  });

  it('contrato de clips: el primero disponible; sin clips, pose procedural', () => {
    expect(resolveClip('reviewing', ['Idle', 'Thinking'])).toBe('Thinking');
    expect(resolveClip('warning', ['Idle'])).toBe('Idle');
    expect(resolveClip('speaking', [])).toBeNull();
  });

  it('sin personaje: Pixi neutral (nunca un avatar inventado); ambient siempre 2D', () => {
    const neutral = render(<PixelPresenceAvatar avatar={null} level="interactive" />);
    expect(neutral).toContain('alt="Pixi"');
    const ambient = render(<PixelPresenceAvatar avatar={avatarFixture()} level="ambient" />);
    expect(ambient).toContain('<svg');
    expect(ambient).not.toContain('<canvas');
  });

  it('el estado se anuncia en texto y el anillo usa el acento del Pixel', () => {
    const html = render(
      <PixelPresenceAvatar avatar={null} level="interactive" state="thinking" announce />,
      presenceWith({ accent: { color: '#c08a63', source: 'avatar' } }),
    );
    expect(text(html)).toContain('Pensando…');
    expect(html).toContain('data-presence="thinking"');
    expect(html).toContain('border-color:#c08a63');
  });

  it('movimiento reducido: sin pulso en el anillo', () => {
    const html = render(
      <PixelPresenceAvatar avatar={null} level="interactive" state="thinking" />,
      presenceWith({ reducedMotion: true }),
    );
    expect(html).not.toContain('animate-pulse');
  });
});

describe('WorkspaceAccentResolver', () => {
  it('un color oscuro de la marca se aclara hasta leerse sobre el fondo oscuro', () => {
    const accent = resolveAccent(avatarFixture());
    expect(accent.source).toBe('avatar');
    expect(contrastRatio(accent.color!, '#08080B')).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
  });

  it('sin personaje, acento del sistema', () => {
    expect(resolveAccent(null)).toEqual({ color: null, source: 'system' });
  });
});

describe('Perfiles derivados del personaje (sin clonación)', () => {
  it('TINTO pausado frente a una marca enérgica', () => {
    const calm = avatarFixture();
    const energetic = avatarFixture({
      idleBehavior: { animation: 'bounce', energy: 0.9, description: 'Rebota.' },
    });
    expect(voiceProfileOf(calm).pace).toBeLessThan(voiceProfileOf(energetic).pace);
    expect(behaviorProfileOf(calm).movementEnergy).toBeLessThan(
      behaviorProfileOf(energetic).movementEnergy,
    );
  });
});

/* ---------- Voz ---------- */

type Listener = Record<string, ((event: never) => void) | null>;

function fakeRecognitionWindow(script: (recognition: Listener) => void) {
  class FakeRecognition {
    lang = '';
    interimResults = false;
    continuous = false;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      script(this as unknown as Listener);
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  return { SpeechRecognition: FakeRecognition } as never;
}

describe('Voice runtime', () => {
  it('capacidades del navegador: nada que fingir si no existen', () => {
    expect(voiceCapabilities(null)).toEqual({ input: false, output: false });
    expect(voiceCapabilities(fakeRecognitionWindow(() => {}))).toEqual({
      input: true,
      output: false,
    });
  });

  it('entrada: la transcripción final llega entera; luego termina', () => {
    const win = fakeRecognitionWindow((r) => {
      (r.onresult as (e: unknown) => void)({
        resultIndex: 0,
        results: [
          { isFinal: true, 0: { transcript: 'Necesito tres contenidos para esta semana' } },
        ],
      });
      (r.onend as () => void)();
    });
    const onTranscript = vi.fn();
    const onEnd = vi.fn();
    browserVoiceInput(win).start({ onTranscript, onEnd, onError: vi.fn() }, 'es-ES');
    expect(onTranscript).toHaveBeenCalledWith('Necesito tres contenidos para esta semana', true);
    expect(onEnd).toHaveBeenCalled();
  });

  it('permiso denegado → denied; sin API → unsupported', () => {
    const win = fakeRecognitionWindow((r) =>
      (r.onerror as (e: unknown) => void)({ error: 'not-allowed' }),
    );
    const onError = vi.fn();
    browserVoiceInput(win).start({ onTranscript: vi.fn(), onEnd: vi.fn(), onError }, 'es-ES');
    expect(onError).toHaveBeenCalledWith('denied');
    const unsupported = vi.fn();
    NO_VOICE_INPUT.start({ onTranscript: vi.fn(), onEnd: vi.fn(), onError: unsupported }, 'es');
    expect(unsupported).toHaveBeenCalledWith('unsupported');
  });

  it('salida: termina al acabar; cancelar no es un fallo; un fallo real se informa', () => {
    const handlers: { onend?: () => void; onerror?: (e: { error: string }) => void }[] = [];
    class Utterance {
      lang = '';
      rate = 1;
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(public text: string) {
        handlers.push(this as never);
      }
    }
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const output = browserVoiceOutput({
      speechSynthesis: synth,
      SpeechSynthesisUtterance: Utterance,
    } as never);
    const onEnd = vi.fn();
    const onError = vi.fn();
    output.speak('Hola', { lang: 'es-ES', rate: 1, voiceId: null }, { onEnd, onError });
    handlers[0]!.onerror!({ error: 'canceled' });
    expect(onEnd).toHaveBeenCalled();
    output.speak('Hola', { lang: 'es-ES', rate: 1, voiceId: null }, { onEnd, onError });
    handlers[1]!.onerror!({ error: 'synthesis-failed' });
    expect(onError).toHaveBeenCalledWith('failed');
  });

  it('español de Colombia: voz es-CO si existe; si no, otra en español; si no, la del navegador', () => {
    const v = (lang: string, name = lang) => ({ lang, name, voiceURI: name });
    expect(preferredVoice([v('en-US'), v('es-ES'), v('es-CO', 'Salomé')], 'es-CO')?.name).toBe(
      'Salomé',
    );
    // Varias es-CO: una de ellas (la primera).
    expect(preferredVoice([v('es-CO', 'A'), v('es-CO', 'B')], 'es-CO')?.name).toBe('A');
    // Formato Android (es_CO) también cuenta como es-CO.
    expect(preferredVoice([v('es-MX'), v('es_CO', 'Android')], 'es-CO')?.name).toBe('Android');
    expect(preferredVoice([v('en-US'), v('es-MX', 'México')], 'es-CO')?.name).toBe('México');
    expect(preferredVoice([v('en-US'), v('fr-FR')], 'es-CO')).toBeNull();
    // El idioma de Pixel (síntesis y reconocimiento), con el ritmo de siempre.
    expect(voiceProfileOf(null)).toMatchObject({ language: 'es-CO', pace: 1 });
  });

  it('al hablar usa la voz es-CO… salvo que el usuario haya elegido otra', () => {
    const spoken: { lang: string; voice?: { name: string } }[] = [];
    class Utterance {
      lang = '';
      rate = 1;
      voice?: { name: string };
      onstart?: () => void;
      onend?: () => void;
      onerror?: (event: { error: string }) => void;
      constructor(public text: string) {
        spoken.push(this);
      }
    }
    const voices = [
      { lang: 'es-ES', name: 'España', voiceURI: 'es-es' },
      { lang: 'es-CO', name: 'Colombia', voiceURI: 'es-co' },
    ];
    const output = browserVoiceOutput({
      speechSynthesis: {
        cancel: vi.fn(),
        speak: vi.fn(),
        getVoices: () => voices,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      SpeechSynthesisUtterance: Utterance,
    } as never);
    const handlers = { onEnd: vi.fn(), onError: vi.fn() };
    output.speak('Hola', { lang: 'es-CO', rate: 1, voiceId: null }, handlers);
    expect([spoken[0]!.lang, spoken[0]!.voice?.name]).toEqual(['es-CO', 'Colombia']);
    output.speak('Hola', { lang: 'es-CO', rate: 1, voiceId: 'es-es' }, handlers);
    expect(spoken[1]!.voice?.name).toBe('España');
  });

  it('lo hablado es corto: sin ids, viñetas ni listas largas', () => {
    expect(spokenText(`Listo. Organicé «Cosecha» ${ID}.\n• Pieza 1\n• Pieza 2`)).toBe(
      'Listo. Organicé «Cosecha» .',
    );
    expect(spokenText('a'.repeat(400) + '. b.')!.length).toBeLessThanOrEqual(400);
    expect(spokenText(null)).toBeNull();
  });
});

describe('PixelComposer', () => {
  const mic: VoiceInputProvider = { supported: true, start: () => {}, stop: () => {} };

  it('texto siempre; micrófono solo si el navegador lo admite y la voz está activa', () => {
    const textOnly = render(<PixelComposer placeholder="Cuéntale a Pixel…" onSubmit={() => {}} />);
    expect(textOnly).toContain('<textarea');
    expect(textOnly).toContain('aria-label="Enviar a Pixel"');
    expect(textOnly).not.toContain('Hablar con Pixel');
    const withMic = render(
      <PixelComposer placeholder="Cuéntale a Pixel…" onSubmit={() => {}} voiceInput={mic} />,
    );
    expect(withMic).toContain('aria-label="Hablar con Pixel"');
    const disabled = render(
      <PixelComposer placeholder="…" onSubmit={() => {}} voiceInput={mic} />,
      presenceWith({ preferences: { ...INERT_PRESENCE.preferences, voiceEnabled: false } }),
    );
    expect(disabled).not.toContain('Hablar con Pixel');
  });

  it('sugerencias: inicios de frase (máximo 4), no formularios', () => {
    const html = render(
      <PixelComposer
        placeholder="…"
        onSubmit={() => {}}
        suggestions={['a', 'b', 'c', 'd', 'e'].map((label) => ({ label, text: label }))}
      />,
    );
    expect(html.match(/<button type="button"/g)).toHaveLength(4);
    expect(html).not.toContain('<form action');
  });
});

describe('Pixel Dock y contexto', () => {
  it('el recurso de la ruta es solo una pista (tipo + id válido)', () => {
    expect(dockResourceFor(`/workspace/w1/campaigns/${ID}`)).toEqual({ type: 'campaign', id: ID });
    expect(dockResourceFor(`/workspace/w1/content-planner/${ID}`)).toEqual({
      type: 'content_plan',
      id: ID,
    });
    expect(dockResourceFor(`/workspace/w1/projects/${ID}`)).toEqual({ type: 'project', id: ID });
    expect(dockResourceFor('/workspace/w1/campaigns/no-es-un-id')).toBeNull();
    expect(dockResourceFor(`/company/c1/brand`)).toBeNull();
    expect(dockContextLabel({ type: 'campaign', id: ID })).toBe('Con esta campaña en contexto');
  });

  it('no aparece en el Inicio, el chat ni los onboardings (sin duplicar la entrada)', () => {
    expect(dockVisibleAt('/workspace/w1')).toBe(false);
    expect(dockVisibleAt('/company/c1')).toBe(false);
    expect(dockVisibleAt('/company/c1/chat')).toBe(false);
    expect(dockVisibleAt('/company/c1/onboarding')).toBe(false);
    expect(dockVisibleAt('/workspace/w1/personal/onboarding')).toBe(false);
    expect(dockVisibleAt('/workspace/w1/campaigns')).toBe(true);
    expect(dockVisibleAt('/company/c1/brand')).toBe(true);
    expect(dockVisibleAt('/dashboard')).toBe(false);
  });

  it('plegado: un control pequeño; desplegado: Pixel · marca, contexto y la conversación completa', () => {
    const props = {
      panelId: 'dock',
      name: 'Inventia',
      contextLabel: 'Con esta campaña en contexto',
      onToggle: () => {},
      collapsedAvatar: <span>avatar</span>,
      body: <p>PixelCommand</p>,
      chatPath: '/company/c1/chat',
    };
    const closedHtml = render(<PixelDockView open={false} {...props} />);
    const closed = text(closedHtml);
    expect(closed).toContain('Pixel');
    // Nombre accesible explícito: no la descripción de la figura que lleva dentro.
    expect(closedHtml).toContain('aria-label="Abrir Pixel de Inventia"');
    expect(closed).not.toContain('PixelCommand');
    const open = render(<PixelDockView open {...props} />);
    expect(text(open)).toContain('Pixel · Inventia');
    expect(text(open)).toContain('Con esta campaña en contexto');
    expect(open).toContain('href="/company/c1/chat"');
    expect(open).toContain('aria-label="Cerrar Pixel"');
  });
});

/* ---------- Tus Pixels e Inicio ---------- */

const overview = (overrides: Partial<WorkspaceOverview> = {}): WorkspaceOverview => ({
  workspace: {
    id: ID,
    ownerId: ID,
    type: 'enterprise',
    name: 'Inventia',
    slug: 'inventia',
    status: 'active',
    timezone: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  company: {
    id: ID,
    workspaceId: ID,
    ownerId: ID,
    name: 'Inventia',
    slug: 'inventia',
    industry: 'Tecnología',
    description: '',
    logoUrl: null,
    status: 'ready',
    brandDnaVersion: 1,
    avatarVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  },
  personal: null,
  avatar: avatarFixture(),
  ...overrides,
});

describe('Tus Pixels', () => {
  it('configurado: miniatura 2D del personaje (sin WebGL), «Pixel Enterprise» y «Listo»', () => {
    const html = render(<WorkspaceCard overview={overview()} />);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain('<canvas');
    expect(text(html)).toContain('Pixel Enterprise');
    expect(text(html)).toContain('Listo');
  });

  it('sin configurar: monograma (nunca un personaje inventado) y «Configurar marca»', () => {
    const html = render(
      <WorkspaceCard
        overview={overview({
          avatar: null,
          company: {
            ...overview().company!,
            status: 'draft',
            brandDnaVersion: null,
            avatarVersion: null,
          },
        })}
      />,
    );
    // Solo la flecha de la tarjeta: ninguna miniatura de personaje.
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(text(html)).toContain('IN');
    expect(text(html)).toContain('Configurar marca');
  });

  it('Personal: el nombre de la persona y «Pixel Personal»', () => {
    const html = render(
      <WorkspaceCard
        overview={overview({
          workspace: { ...overview().workspace, type: 'personal', name: 'Jhon' },
          company: null,
          personal: {
            name: 'Jhon Trochez',
            completedSteps: 8,
            personalDnaVersion: 1,
            avatarVersion: 1,
          },
        })}
      />,
    );
    expect(text(html)).toContain('Jhon Trochez');
    expect(text(html)).toContain('Pixel Personal');
  });
});

const summary = (counts: Partial<OperationsSummary['counts']> = {}): OperationsSummary => ({
  counts: {
    activeProjects: 0,
    openTasks: 0,
    overdueTasks: 0,
    contentInProduction: 0,
    activeContentItems: 0,
    activeCampaigns: 0,
    currentCampaigns: 0,
    ...counts,
  },
  upcomingTasks: [],
  recentProjects: [],
  upcomingContent: [],
});

describe('Inicio: vacío frente a con trabajo', () => {
  const empty = {
    title: 'Inventia está lista.',
    text: 'Dime qué necesitas y lo organizo contigo.',
  };

  it('todo en cero: el Pixel está listo (no una pared de ceros)', () => {
    expect(isEmptyWork(summary(), true)).toBe(true);
    const html = render(
      <OperationsOverviewView
        state={{ status: 'success', data: summary() }}
        base="/workspace/w1"
        onRetry={() => {}}
        showCampaigns
        empty={empty}
      />,
    );
    expect(text(html)).toContain('Inventia está lista.');
    expect(text(html)).not.toContain('Campañas vigentes');
  });

  it('existe trabajo si hay cualquier recurso vigente, no solo lo activo', () => {
    expect(isEmptyWork(summary(), true)).toBe(true);
    // Campaña en borrador: vigente, aunque no activa.
    expect(isEmptyWork(summary({ currentCampaigns: 1 }), true)).toBe(false);
    expect(isEmptyWork(summary({ currentCampaigns: 1, activeCampaigns: 1 }), true)).toBe(false);
    // Proyecto planificado: no cuenta como activo, pero aparece en recientes.
    const planned = { ...summary(), recentProjects: [projectFixture({ status: 'planned' })] };
    expect(isEmptyWork(planned, true)).toBe(false);
    expect(isEmptyWork(summary({ activeProjects: 1 }), true)).toBe(false);
    expect(isEmptyWork(summary({ openTasks: 1 }), true)).toBe(false);
    expect(isEmptyWork(summary({ activeContentItems: 1 }), true)).toBe(false);
  });

  it('solo una campaña en borrador: «Campañas vigentes 1», nunca una fila de ceros', () => {
    const html = render(
      <OperationsOverviewView
        state={{ status: 'success', data: summary({ currentCampaigns: 1 }) }}
        base="/workspace/w1"
        onRetry={() => {}}
        showCampaigns
        empty={empty}
      />,
    );
    expect(text(html)).not.toContain('Inventia está lista.');
    expect(text(html)).toContain('Campañas vigentes 1');
    expect(text(html)).toContain('0 activas');
    expect(html).toContain('href="/workspace/w1/campaigns"');
  });

  it('con trabajo real: el resumen operativo de siempre', () => {
    const html = render(
      <OperationsOverviewView
        state={{ status: 'success', data: summary({ activeProjects: 2 }) }}
        base="/workspace/w1"
        onRetry={() => {}}
        showCampaigns
        empty={empty}
      />,
    );
    expect(text(html)).toContain('Proyectos activos');
    expect(text(html)).not.toContain('Inventia está lista.');
  });
});

describe('Ajustes de voz y movimiento', () => {
  const base = {
    preferences: INERT_PRESENCE.preferences,
    onChange: () => {},
    voices: [
      { id: 'es-1', label: 'Mónica (es-ES)', lang: 'es-ES' },
      { id: 'en-1', label: 'Samantha (en-US)', lang: 'en-US' },
    ],
    defaultRate: 0.96,
    onPreview: () => {},
    speaking: false,
    onStop: () => {},
  };

  it('pocas opciones: voz, hablar en sesiones, voz disponible (en español), ritmo y animaciones', () => {
    const html = render(
      <PresenceSettingsView {...base} capabilities={{ input: true, output: true }} />,
    );
    for (const label of [
      'Voz activada',
      'Hablar en sesiones de voz',
      'Mónica (es-ES)',
      'Ritmo',
      'Escuchar a Pixel',
      'Reducir animaciones de Pixel',
    ]) {
      expect(text(html)).toContain(label);
    }
    expect(html).not.toContain('Samantha');
  });

  it('sin voz en el navegador: lo dice y todo sigue por texto', () => {
    const html = text(
      render(<PresenceSettingsView {...base} capabilities={{ input: false, output: false }} />),
    );
    expect(html).toContain('Todo sigue funcionando por texto');
    expect(html).toContain('Reducir animaciones de Pixel');
  });

  it('privacidad de la voz siempre consultable en los ajustes (si hay micrófono)', () => {
    const withMic = text(
      render(<PresenceSettingsView {...base} capabilities={{ input: true, output: true }} />),
    );
    expect(withMic).toContain('Privacidad de la voz');
    expect(withMic).toContain(VOICE_PRIVACY_NOTICE);
    const noMic = text(
      render(<PresenceSettingsView {...base} capabilities={{ input: false, output: true }} />),
    );
    expect(noMic).not.toContain('Privacidad de la voz');
  });
});

describe('Aviso de privacidad de la voz', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('el texto acordado, con una confirmación simple y la opción de no seguir', () => {
    expect(VOICE_PRIVACY_NOTICE).toBe(
      'Pixel utiliza las funciones de reconocimiento de voz disponibles en tu navegador. Dependiendo del navegador, el audio puede ser procesado por su proveedor. Pixel no almacena el audio.',
    );
    const html = render(<VoicePrivacyNotice onAccept={() => {}} onDismiss={() => {}} />);
    expect(text(html)).toContain(VOICE_PRIVACY_NOTICE);
    expect(text(html)).toContain('Entendido');
    expect(text(html)).toContain('Ahora no');
    expect(html).toContain('aria-label="Privacidad de la voz"');
  });

  it('solo la primera vez en el dispositivo: visto se recuerda (por dispositivo, no por Pixel)', async () => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    const notice = await import('./presenceProfile');
    expect(notice.voiceNoticeSeen()).toBe(false);
    notice.markVoiceNoticeSeen();
    expect(notice.voiceNoticeSeen()).toBe(true);
    expect([...store.keys()]).toEqual(['pixel:voice-notice']);
    // Nada de audio ni transcripciones: solo la marca de «visto».
    expect([...store.values()]).toEqual(['seen']);
  });

  it('sin almacenamiento: no se repite en la sesión y nada se rompe', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
        setItem: () => {
          throw new Error('bloqueado');
        },
      },
    });
    const notice = await import('./presenceProfile');
    expect(notice.voiceNoticeSeen()).toBe(false);
    expect(() => notice.markVoiceNoticeSeen()).not.toThrow();
    expect(notice.voiceNoticeSeen()).toBe(true);
  });
});

describe('Presencia de campañas, planes y Guardian', () => {
  const cmd = (status: string, guardian: { status: string } | null = null) =>
    ({
      status,
      guardian,
      question: '¿Qué producto vamos a lanzar?',
      reply: 'Listo. Organicé la campaña.',
      plan: { summary: 'Propongo una campaña y su plan.' },
    }) as never;

  it('campaña: pensando durante la petición; organizada → success; propuesta → idle (o speaking en voz)', () => {
    expect(presenceAfterCommand(cmd('completed'))).toBe('success');
    expect(presenceAfterCommand(cmd('proposed', { status: 'pass' }))).toBe('idle');
    expect(spokenFor(cmd('proposed'))).toBe('Propongo una campaña y su plan.');
  });

  it('plan: el preflight del Guardian con aviso o bloqueo → warning; un fallo → error', () => {
    expect(presenceAfterCommand(cmd('proposed', { status: 'warning' }))).toBe('warn');
    expect(presenceAfterCommand(cmd('proposed', { status: 'block' }))).toBe('warn');
    expect(presenceAfterCommand(cmd('failed'))).toBe('fail');
    // Prompt 18: algo verificado y algo no → aviso (no error, no éxito).
    expect(presenceAfterCommand(cmd('partial'))).toBe('warn');
    expect(presenceAfterCommand(cmd('needs_information'))).toBe('idle');
    expect(spokenFor(cmd('needs_information'))).toBe('¿Qué producto vamos a lanzar?');
  });

  it('Guardian manual: pasa → success; aviso o bloqueo → warning (sobrio)', () => {
    expect(presenceAfterReview('pass')).toBe('success');
    expect(presenceAfterReview('warning')).toBe('warn');
    expect(presenceAfterReview('block')).toBe('warn');
  });
});
