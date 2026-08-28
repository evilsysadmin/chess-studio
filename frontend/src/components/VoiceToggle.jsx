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
      aria-label={enabled ? 'Desactivar voz del chat de partida' : 'Activar voz del chat de partida'}
      title={supported
        ? (enabled ? 'VOZ ON · pulsar para silenciar la CPU' : 'VOZ OFF · pulsar para oír a la CPU')
        : 'La síntesis de voz no está disponible en este navegador'}
    >
      <span className="game-chat-voice-label">VOZ</span>
      <span className="game-chat-voice-state">{supported ? (enabled ? 'ON' : 'OFF') : 'N/A'}</span>
    </button>
  );
}
