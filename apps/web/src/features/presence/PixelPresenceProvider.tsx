import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PresenceContext,
  reportPresence,
  usePixelPresence,
  type PixelPresence,
  type PresenceScopeInfo,
} from './presenceContext';
import {
  scopeSwitchStopsVoice,
  speechFor,
  TRANSIENT_MS,
  transition,
  type PixelPresenceState,
  type PresenceEvent,
} from './presenceMachine';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  voiceProfileOf,
  type PresencePreferences,
} from './presenceProfile';
import { PRESENCE_LABELS } from './presenceMachine';
import {
  browserVoiceInput,
  browserVoiceOutput,
  spokenText,
  type VoiceInputProvider,
  type VoiceOutputProvider,
} from './voice';
import { resolveAccent } from './workspaceAccent';

/*
 * PixelPresenceProvider (Prompt 17): UN estado de presencia para todo el árbol (Inicio, Campañas,
 * Plan de contenido, Guardian, el Pixel Dock y la topbar comparten al mismo Pixel). Vive en el
 * AppShell; cada pantalla de workspace lo LIGA a su Pixel (`PresenceScope`). Al cambiar de Pixel:
 * se detiene la voz y el micrófono, se limpia lo transitorio y se cargan su personaje, su voz y su
 * acento. Nunca se mezclan voces ni avatares entre workspaces.
 */

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function PixelPresenceProvider({
  children,
  input: inputOverride,
  output: outputOverride,
}: {
  children: ReactNode;
  /** Para tests: proveedores de voz simulados. */
  input?: VoiceInputProvider;
  output?: VoiceOutputProvider;
}) {
  const [state, setState] = useState<PixelPresenceState>('idle');
  const [scope, setScope] = useState<PresenceScopeInfo | null>(null);
  const [voiceSession, setVoiceSession] = useState(false);
  const [preferences, setPrefs] = useState<PresencePreferences>(DEFAULT_PREFERENCES);
  const [systemReduced, setSystemReduced] = useState(systemReducedMotion);
  const input = useMemo(() => inputOverride ?? browserVoiceInput(), [inputOverride]);
  const output = useMemo(() => outputOverride ?? browserVoiceOutput(), [outputOverride]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lo que decide si Pixel habla se lee en el momento de hablar, no al crear el callback: la
  // respuesta llega tras un await (y el micrófono entrega el texto desde un handler creado al
  // pulsar), así que un cierre viejo callaría a Pixel o hablaría con la sesión de otro Pixel.
  const live = useRef({
    voiceSession: false,
    preferences: DEFAULT_PREFERENCES,
    scope: null as PresenceScopeInfo | null,
  });
  const setSession = useCallback((on: boolean) => {
    live.current.voiceSession = on;
    setVoiceSession(on);
  }, []);
  const applyPrefs = useCallback((next: PresencePreferences) => {
    live.current.preferences = next;
    setPrefs(next);
  }, []);

  const send = useCallback((event: PresenceEvent) => {
    setState((current) => transition(current, event));
  }, []);

  // Lo transitorio (éxito, aviso, error) vuelve solo a idle: nunca queda colgado.
  useEffect(() => {
    const ms = TRANSIENT_MS[state];
    if (!ms) return;
    timer.current = setTimeout(() => setState((current) => transition(current, 'idle')), ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  useEffect(() => {
    try {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onChange = () => setSystemReduced(media.matches);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    } catch {
      return undefined;
    }
  }, []);

  const stopAll = useCallback(() => {
    output.cancel();
    input.stop();
  }, [input, output]);

  const scopeRef = useRef<PresenceScopeInfo | null>(null);
  const bind = useCallback(
    (next: PresenceScopeInfo | null) => {
      if (scopeSwitchStopsVoice(scopeRef.current, next)) {
        // Cambio de Pixel: TINTO deja de hablar en el acto; nada pasa al siguiente.
        stopAll();
        setSession(false);
        setState('idle');
        applyPrefs(loadPreferences(next?.workspaceId ?? null));
      }
      scopeRef.current = next;
      live.current.scope = next;
      setScope(next);
    },
    [stopAll, setSession, applyPrefs],
  );

  // Al desmontar la app (cerrar sesión, recargar): micrófono y voz cerrados.
  useEffect(() => stopAll, [stopAll]);

  const speakNow = useCallback(
    (spoken: string) => {
      const { scope: current, preferences: prefs } = live.current;
      const profile = voiceProfileOf(current?.avatar ?? null);
      send('speak');
      output.speak(
        spoken,
        { lang: profile.language, rate: prefs.rate ?? profile.pace, voiceId: prefs.voiceId },
        {
          onEnd: () => send('idle'),
          onError: () => {
            reportPresence('voice_output_failed');
            send('idle');
          },
        },
      );
    },
    [output, send],
  );

  const say = useCallback(
    (text: string | null | undefined) => {
      const { voiceSession: session, preferences: prefs } = live.current;
      const spoken = speechFor(spokenText(text), {
        voiceSession: session,
        voiceEnabled: prefs.voiceEnabled,
        autoSpeak: prefs.autoSpeak,
        outputSupported: output.supported,
      });
      if (spoken) speakNow(spoken);
    },
    [output, speakNow],
  );

  const preview = useCallback(
    (text: string) => {
      if (!output.supported || !live.current.preferences.voiceEnabled) return;
      speakNow(text);
    },
    [output, speakNow],
  );

  const setPreferences = useCallback(
    (next: PresencePreferences) => {
      applyPrefs(next);
      if (scope) savePreferences(scope.workspaceId, next);
      if (!next.voiceEnabled) output.cancel();
    },
    [scope, output, applyPrefs],
  );

  const value = useMemo<PixelPresence>(
    () => ({
      state,
      label: PRESENCE_LABELS[state],
      scope,
      accent: resolveAccent(scope?.avatar ?? null),
      reducedMotion: systemReduced || preferences.reduceMotion,
      send,
      think: () => send('think'),
      listen: () => send('listen'),
      review: () => send('review'),
      success: () => send('success'),
      warn: () => send('warn'),
      fail: () => send('fail'),
      idle: () => send('idle'),
      say,
      preview,
      stopSpeaking: () => {
        output.cancel();
        send('idle');
      },
      voiceSession,
      startVoiceSession: () => setSession(true),
      endVoiceSession: () => {
        output.cancel();
        input.stop();
        setSession(false);
        send('idle');
      },
      input,
      output,
      preferences,
      setPreferences,
      bind,
    }),
    [
      state,
      scope,
      systemReduced,
      preferences,
      send,
      say,
      preview,
      voiceSession,
      input,
      output,
      setPreferences,
      bind,
      setSession,
    ],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/** Liga la presencia al Pixel de la pantalla; al salir del workspace la libera (y calla). */
export function PresenceScope({
  info,
  children,
}: {
  info: PresenceScopeInfo;
  children?: ReactNode;
}) {
  const { bind } = usePixelPresence();
  const { workspaceId, name, avatar, configured } = info;
  useEffect(() => {
    bind({ workspaceId, name, avatar, configured });
  }, [bind, workspaceId, name, avatar, configured]);
  useEffect(() => () => bind(null), [bind]);
  return <>{children}</>;
}
