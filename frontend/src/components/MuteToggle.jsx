import React, { useState } from 'react';
import { isMuted, setMuted } from '../sound.js';
import { IconVolume, IconVolumeMuted } from './Icons.jsx';

export default function MuteToggle() {
  const [muted, setMutedState] = useState(() => isMuted());

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  return (
    <button
      type="button"
      className="mute-toggle"
      onClick={toggle}
      aria-label={muted ? 'Activar sonido' : 'Silenciar'}
      title={muted ? 'Activar sonido' : 'Silenciar'}
    >
      {muted ? <IconVolumeMuted /> : <IconVolume />}
    </button>
  );
}
