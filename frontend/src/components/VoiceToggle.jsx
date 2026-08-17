import React, { useState } from 'react';
import { isVoiceEnabled, setVoiceEnabled } from '../voiceCommentary.js';

// Apagado por defecto — narrar cada jugada puede cansar rápido si no lo
// pediste tú mismo, así que esto es opt-in, no opt-out como el mute de
// música/efectos.
export default function VoiceToggle() {
  const [enabled, setEnabledState] = useState(() => isVoiceEnabled());

  function toggle() {
    const next = !enabled;
    setVoiceEnabled(next);
    setEnabledState(next);
  }

  return (
    <button
      type="button"
      className="mute-toggle"
      onClick={toggle}
      aria-label={enabled ? 'Desactivar voz de la CPU' : 'Activar voz de la CPU'}
      title={enabled ? 'Voz de la CPU: activada' : 'Voz de la CPU: desactivada'}
    >
      {enabled ? '🗣️' : '🔇'}
    </button>
  );
}
