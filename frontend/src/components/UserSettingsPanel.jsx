import { useState } from 'react';
import { TIME_CONTROLS } from '../clock.js';
import { getAmbientVolume, isFxMuted, isMusicMuted, setAmbientVolume, setFxMuted, setMusicMuted } from '../sound.js';
import { getDefaultTimeControlId, getUiLanguage, setDefaultTimeControlId, setUiLanguage, SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function UserSettingsPanel({ onClose }) {
  useEscapeToClose(onClose);
  const [timeControlId, setTimeControlIdState] = useState(() => getDefaultTimeControlId());
  const [language, setLanguageState] = useState(() => getUiLanguage());
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => getAmbientVolume());

  function updateTimeControl(value) {
    setTimeControlIdState(setDefaultTimeControlId(value));
  }
  function updateLanguage(value) {
    setLanguageState(setUiLanguage(value));
  }
  function updateMusic(muted) {
    setMusicMuted(muted);
    setMusicMutedState(muted);
  }
  function updateFx(muted) {
    setFxMuted(muted);
    setFxMutedState(muted);
  }
  function updateVolume(value) {
    const normalized = setAmbientVolume(Number(value));
    setVolume(normalized);
  }

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-panel-heading">
          <div><span className="section-label">Preferencias</span><h2 id="settings-title">Ajustes</h2></div>
          <button type="button" className="secondary-btn" onClick={onClose}>Cerrar</button>
        </div>

        <div className="settings-sections">
          <section>
            <h3>Partidas</h3>
            <label className="settings-field"><span>Reloj por defecto</span><select value={timeControlId} onChange={(event) => updateTimeControl(event.target.value)}>{TIME_CONTROLS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
            <small>Se usa al abrir una nueva Partida rápida o Práctica. Puedes cambiarlo antes de empezar.</small>
          </section>

          <section>
            <h3>Audio</h3>
            <label className="settings-toggle"><input type="checkbox" checked={!musicMuted} onChange={(event) => updateMusic(!event.target.checked)} /><span>Música ambiental</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={!fxMuted} onChange={(event) => updateFx(!event.target.checked)} /><span>Efectos de sonido</span></label>
            <label className="settings-field"><span>Volumen música · {Math.round(volume * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => updateVolume(event.target.value)} /></label>
          </section>

          <section>
            <h3>Idioma</h3>
            <label className="settings-field"><span>Interfaz</span><select value={language} onChange={(event) => updateLanguage(event.target.value)}>{SUPPORTED_UI_LANGUAGES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
            <small>De momento la interfaz está disponible en español. La preferencia ya queda centralizada para futuras traducciones.</small>
          </section>
        </div>
      </section>
    </div>
  );
}
