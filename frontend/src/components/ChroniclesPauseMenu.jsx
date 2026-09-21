import { useEffect, useRef, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import {
  getAmbientVolume,
  isFxMuted,
  isMusicMuted,
  setAmbientVolume,
  setFxMuted,
  setMusicMuted,
} from '../sound.js';

export default function ChroniclesPauseMenu({ onResume, onExit }) {
  const resumeRef = useRef(null);
  useEscapeToClose(onResume, { contextMenuAction: 'ignore' });
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => Math.round(getAmbientVolume() * 100));

  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

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

  function changeVolume(event) {
    const next = Math.max(0, Math.min(100, Number(event.target.value) || 0));
    setVolume(next);
    setAmbientVolume(next / 100);
  }

  function resumeFromBackdrop(event) {
    if (event.button !== 0) return;
    if (event.target === event.currentTarget) onResume?.();
  }

  return (
    <div
      className="chronicles-pause"
      data-chronicles-pause="true"
      onMouseDown={resumeFromBackdrop}
      role="presentation"
    >
      <section
        className="chronicles-pause__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chronicles-pause-title"
      >
        <div className="chronicles-pause__heading">
          <span className="section-label">CHRONICLES OF MATTHIAS</span>
          <h2 id="chronicles-pause-title">Pausa</h2>
          <small>ESC o Back · continuar</small>
        </div>

        <button
          ref={resumeRef}
          type="button"
          className="chronicles-pause__resume primary-btn"
          onClick={onResume}
        >
          Continuar expedición
        </button>

        <div className="chronicles-pause__grid">
          <section className="chronicles-pause__section" aria-labelledby="chronicles-pause-audio">
            <h3 id="chronicles-pause-audio">Sonido</h3>
            <button
              type="button"
              className="chronicles-pause__toggle"
              aria-pressed={!musicMuted}
              onClick={toggleMusic}
            >
              <span>Música</span>
              <strong>{musicMuted ? 'Silenciada' : 'Activa'}</strong>
            </button>
            <label className="chronicles-pause__volume">
              <span>
                <b>Volumen de música</b>
                <output>{volume}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={changeVolume}
                aria-label="Volumen de música"
              />
            </label>
            <button
              type="button"
              className="chronicles-pause__toggle"
              aria-pressed={!fxMuted}
              onClick={toggleFx}
            >
              <span>Efectos</span>
              <strong>{fxMuted ? 'Silenciados' : 'Activos'}</strong>
            </button>
          </section>

          <section className="chronicles-pause__section" aria-labelledby="chronicles-pause-controls">
            <h3 id="chronicles-pause-controls">Controles</h3>
            <dl className="chronicles-pause__controls">
              <div><dt>WASD / flechas</dt><dd>Mover</dd></div>
              <div><dt>1–4</dt><dd>Cambiar héroe</dd></div>
              <div><dt>Espacio</dt><dd>Usar</dd></div>
              <div><dt>Shift</dt><dd>Atacar</dd></div>
              <div><dt>E</dt><dd>Habilidad</dd></div>
              <div><dt>ESC / Back</dt><dd>Pausa</dd></div>
            </dl>
            <small className="chronicles-pause__hint">
              El botón derecho queda reservado al juego y nunca te expulsa de la expedición.
            </small>
          </section>
        </div>

        <div className="chronicles-pause__footer">
          <button type="button" className="secondary-btn" onClick={onResume}>Volver al tablero</button>
          <button type="button" className="chronicles-pause__exit" onClick={onExit}>Salir de Chronicles</button>
        </div>
      </section>
    </div>
  );
}
