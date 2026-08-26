import { useState } from 'react';
import { isVoiceEnabled, isVoiceSupported, previewCpuVoice, setVoiceEnabled } from '../voiceCommentary.js';

// Opt-in deliberado: VOICE arranca OFF. Al activarlo desde un click real
// hacemos una prueba breve: además de confirmar que funciona, ese gesto
// desbloquea speechSynthesis en navegadores que lo exigen.
export default function VoiceToggle() {
  const [enabled, setEnabledState] = useState(() => isVoiceEnabled());
  const supported = isVoiceSupported();

  function toggle() {
    if (!supported) return;
    const next = !enabled;
    setVoiceEnabled(next);
    setEnabledState(next);
    if (next) previewCpuVoice();
  }

  return (
    <button
      type="button"
      className={`game-chat-voice-toggle${enabled ? ' is-on' : ' is-off'}`}
      onClick={toggle}
      disabled={!supported}
      aria-pressed={enabled}
      aria-label={enabled ? 'Desactivar voz del Game Chat' : 'Activar voz del Game Chat'}
      title={supported
        ? (enabled ? 'VOICE ON · pulsar para silenciar la CPU' : 'VOICE OFF · pulsar para oír a la CPU')
        : 'La síntesis de voz no está disponible en este navegador'}
    >
      <span className="game-chat-voice-label">VOICE</span>
      <span className="game-chat-voice-state">{supported ? (enabled ? 'ON' : 'OFF') : 'N/A'}</span>
    </button>
  );
}
