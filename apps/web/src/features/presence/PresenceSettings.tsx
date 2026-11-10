import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { usePixelPresence } from './presenceContext';
import type { PresencePreferences } from './presenceProfile';
import { VOICE_PRIVACY_NOTICE, voiceProfileOf } from './presenceProfile';
import type { VoiceOption, voiceCapabilities } from './voice';

/*
 * Voz y movimiento del Pixel (Prompt 17), en la página de su personaje. Pocas opciones y simples:
 * voz activada, voz disponible en ESTE navegador, ritmo, hablar en sesiones de voz y reducir
 * animaciones. Se guardan en este dispositivo y por Pixel (las voces dependen del navegador). No
 * hay clonación ni "la voz de nadie": solo voces que el navegador ya ofrece.
 */
export function PresenceSettings() {
  const presence = usePixelPresence();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const { output } = presence;

  useEffect(() => {
    const refresh = () => setVoices(output.voices());
    refresh();
    return output.onVoicesChanged(refresh);
  }, [output]);

  if (!presence.scope?.configured) return null;
  return (
    <PresenceSettingsView
      preferences={presence.preferences}
      onChange={presence.setPreferences}
      voices={voices}
      capabilities={{ input: presence.input.supported, output: output.supported }}
      defaultRate={voiceProfileOf(presence.scope.avatar).pace}
      onPreview={() =>
        presence.preview(`Hola, soy el Pixel de ${presence.scope?.name ?? 'tu marca'}.`)
      }
      speaking={presence.state === 'speaking'}
      onStop={presence.stopSpeaking}
    />
  );
}

/** Vista pura (testeable). */
export function PresenceSettingsView({
  preferences,
  onChange,
  voices,
  capabilities,
  defaultRate,
  onPreview,
  speaking,
  onStop,
}: {
  preferences: PresencePreferences;
  onChange: (next: PresencePreferences) => void;
  voices: VoiceOption[];
  capabilities: ReturnType<typeof voiceCapabilities>;
  defaultRate: number;
  onPreview: () => void;
  speaking: boolean;
  onStop: () => void;
}) {
  const voiceId = useId();
  const rateId = useId();
  const set = (patch: Partial<PresencePreferences>) => onChange({ ...preferences, ...patch });
  const rate = preferences.rate ?? defaultRate;
  const noVoice = !capabilities.input && !capabilities.output;

  return (
    <section
      aria-labelledby="presence-settings"
      className="rounded-2xl border border-line bg-surface p-5"
    >
      <h2
        id="presence-settings"
        className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle"
      >
        Voz y movimiento
      </h2>
      {noVoice ? (
        <p className="mt-3 text-sm text-muted">
          Este navegador no ofrece micrófono ni voz para Pixel. Todo sigue funcionando por texto.
        </p>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          <Toggle
            label="Voz activada"
            hint="Micrófono para hablarle y respuestas habladas en una sesión de voz."
            checked={preferences.voiceEnabled}
            onChange={(value) => set({ voiceEnabled: value })}
          />
          {preferences.voiceEnabled && capabilities.output && (
            <>
              <Toggle
                label="Hablar en sesiones de voz"
                hint="Si empiezas con el micrófono, Pixel responde también en voz alta. Nunca habla al abrir una pantalla."
                checked={preferences.autoSpeak}
                onChange={(value) => set({ autoSpeak: value })}
              />
              <div>
                <label htmlFor={voiceId} className="text-muted">
                  Voz
                </label>
                <select
                  id={voiceId}
                  value={preferences.voiceId ?? ''}
                  onChange={(event) => set({ voiceId: event.target.value || null })}
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2 text-fg focus:border-focus focus:outline-none"
                >
                  <option value="">Automática (según el idioma)</option>
                  {voices
                    .filter((voice) => voice.lang.toLowerCase().startsWith('es'))
                    .map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor={rateId} className="flex justify-between text-muted">
                  Ritmo <span className="tabular-nums text-subtle">{rate.toFixed(2)}×</span>
                </label>
                <input
                  id={rateId}
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={rate}
                  onChange={(event) => set({ rate: Number(event.target.value) })}
                  className="mt-2 w-full accent-[currentColor]"
                />
              </div>
              {speaking ? (
                <Button variant="secondary" onClick={onStop}>
                  <Icon name="stop" className="size-3.5" /> Detener
                </Button>
              ) : (
                <Button variant="secondary" onClick={onPreview}>
                  Escuchar a Pixel
                </Button>
              )}
            </>
          )}
          {capabilities.input && (
            <div aria-label="Privacidad de la voz" role="group">
              <p className="text-fg">Privacidad de la voz</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{VOICE_PRIVACY_NOTICE}</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 border-t border-line pt-4 text-sm">
        <Toggle
          label="Reducir animaciones de Pixel"
          hint="Pose fija y transiciones mínimas (también se respeta la preferencia del sistema)."
          checked={preferences.reduceMotion}
          onChange={(value) => set({ reduceMotion: value })}
        />
      </div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-1 size-4 shrink-0 accent-[currentColor]"
      />
      <div>
        <label htmlFor={id} className="text-fg">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}
