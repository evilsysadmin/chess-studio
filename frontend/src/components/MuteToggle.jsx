import React, { useState } from 'react';
import {
  isMusicMuted,
  isFxMuted,
  setMusicMuted,
  setFxMuted,
} from '../sound.js';
import { IconVolume, IconVolumeMuted } from './Icons.jsx';

export default function MuteToggle() {
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());

  function toggleMusic() {
    const next = !musicMuted;
    setMusicMuted(next);
    setMusicMutedState(next);
  }

  function toggleFx() {
    const next = !fxMuted;
    setFxMuted(next);
    setFxMutedState(next);
  }

  return (
    <div className="audio-mute-group" role="group" aria-label="Controles de silencio">
      <button
        type="button"
        className={`mute-toggle audio-channel-toggle${musicMuted ? ' is-muted' : ''}`}
        onClick={toggleMusic}
        aria-pressed={musicMuted}
        aria-label={musicMuted ? 'Activar música' : 'Silenciar música'}
        title={musicMuted ? 'Activar música' : 'Silenciar música'}
      >
        <span className="audio-music-glyph" aria-hidden="true">♫</span>
        <span className="audio-toggle-label">Música</span>
      </button>

      <button
        type="button"
        className={`mute-toggle audio-channel-toggle${fxMuted ? ' is-muted' : ''}`}
        onClick={toggleFx}
        aria-pressed={fxMuted}
        aria-label={fxMuted ? 'Activar efectos' : 'Silenciar efectos'}
        title={fxMuted ? 'Activar efectos' : 'Silenciar efectos'}
      >
        {fxMuted ? <IconVolumeMuted /> : <IconVolume />}
        <span className="audio-toggle-label">FX</span>
      </button>
    </div>
  );
}
