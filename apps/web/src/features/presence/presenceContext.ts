import type { AvatarPreview } from '@pixel/contracts';
import { createContext, useContext } from 'react';
import { PRESENCE_LABELS, type PixelPresenceState, type PresenceEvent } from './presenceMachine';
import { DEFAULT_PREFERENCES, type PresencePreferences } from './presenceProfile';
import {
  NO_VOICE_INPUT,
  NO_VOICE_OUTPUT,
  type VoiceInputProvider,
  type VoiceOutputProvider,
} from './voice';
import { SYSTEM_ACCENT, type WorkspaceAccent } from './workspaceAccent';

/*
 * Contrato de la presencia compartida (Prompt 17): el estado, las acciones y la presencia inerte que
 * se usa fuera del proveedor (tests, pantallas públicas). El proveedor vive en PixelPresenceProvider.
 */

export interface PresenceScopeInfo {
  workspaceId: string;
  name: string;
  avatar: AvatarPreview | null;
  /** El Pixel ya conoce su ADN (sin ADN no hay presencia personalizada ni Dock). */
  configured: boolean;
}

export interface PixelPresence {
  state: PixelPresenceState;
  label: string;
  scope: PresenceScopeInfo | null;
  accent: WorkspaceAccent;
  reducedMotion: boolean;
  send: (event: PresenceEvent) => void;
  think: () => void;
  listen: () => void;
  review: () => void;
  success: () => void;
  warn: () => void;
  fail: () => void;
  idle: () => void;
  /** Habla SOLO dentro de una sesión de voz (nunca al abrir una pantalla). */
  say: (text: string | null | undefined) => void;
  /** «Escuchar a Pixel» en los ajustes: una acción explícita, fuera de la sesión de voz. */
  preview: (text: string) => void;
  stopSpeaking: () => void;
  voiceSession: boolean;
  startVoiceSession: () => void;
  endVoiceSession: () => void;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  preferences: PresencePreferences;
  setPreferences: (next: PresencePreferences) => void;
  bind: (scope: PresenceScopeInfo | null) => void;
}

const noop = () => undefined;

/** Fuera del proveedor (tests, pantallas públicas): presencia inerte, solo texto. */
export const INERT_PRESENCE: PixelPresence = {
  state: 'idle',
  label: PRESENCE_LABELS.idle,
  scope: null,
  accent: SYSTEM_ACCENT,
  reducedMotion: false,
  send: noop,
  think: noop,
  listen: noop,
  review: noop,
  success: noop,
  warn: noop,
  fail: noop,
  idle: noop,
  say: noop,
  preview: noop,
  stopSpeaking: noop,
  voiceSession: false,
  startVoiceSession: noop,
  endVoiceSession: noop,
  input: NO_VOICE_INPUT,
  output: NO_VOICE_OUTPUT,
  preferences: DEFAULT_PREFERENCES,
  setPreferences: noop,
  bind: noop,
};

export const PresenceContext = createContext<PixelPresence>(INERT_PRESENCE);

export function usePixelPresence(): PixelPresence {
  return useContext(PresenceContext);
}

/** Observabilidad mínima sin audio ni transcripciones: un evento del navegador. */
export function reportPresence(name: string, meta: Record<string, string> = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pixel:presence', { detail: { name, ...meta } }));
}
