import { useState } from 'react';
import { TIME_CONTROLS } from '../clock.js';
import { getAmbientVolume, isFxMuted, isMusicMuted, setAmbientVolume, setFxMuted, setMusicMuted } from '../sound.js';
import { getDefaultTimeControlId, getUiLanguage, setDefaultTimeControlId, setUiLanguage, SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { levelForPoints, loadTournament } from '../tournament.js';
import { loadSelectedSkin, PIECE_SKINS, saveSelectedSkin, unlockedSkins } from '../tournamentRewards.js';
import pixelWhiteKnight from '../pieces-medieval/wN.png';
import pixelBlackKnight from '../pieces-medieval/bN.png';
import blueWhiteKnight from '../pieces-medieval-azul/wN.png';
import blueBlackKnight from '../pieces-medieval-azul/bN.png';
import emeraldWhiteKnight from '../pieces-medieval-esmeralda/wN.png';
import emeraldBlackKnight from '../pieces-medieval-esmeralda/bN.png';
import studioWhiteKnight from '../pieces-studio/wN.png';
import studioBlackKnight from '../pieces-studio/bN.png';

const SKIN_PREVIEWS = {
  default: [pixelWhiteKnight, pixelBlackKnight],
  studio: [studioWhiteKnight, studioBlackKnight],
  azul: [blueWhiteKnight, blueBlackKnight],
  esmeralda: [emeraldWhiteKnight, emeraldBlackKnight],
};

export default function UserSettingsPanel({ onClose, onBoard3D }) {
  useEscapeToClose(onClose);
  const [timeControlId, setTimeControlIdState] = useState(() => getDefaultTimeControlId());
  const [language, setLanguageState] = useState(() => getUiLanguage());
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => getAmbientVolume());
  const [pieceSkin, setPieceSkin] = useState(() => loadSelectedSkin());
  const tournamentLevel = levelForPoints(loadTournament().progressPoints || 0);
  const availableSkinIds = new Set(unlockedSkins(tournamentLevel).map((skin) => skin.id));

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
  function updatePieceSkin(id) {
    saveSelectedSkin(id);
    setPieceSkin(id);
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
            <small>Se usa al abrir una nueva Partida rápida o Partida de práctica. Puedes cambiarlo antes de empezar.</small>
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
            <small>La pantalla de acceso ya está localizada. El resto de la interfaz irá adoptando esta preferencia progresivamente.</small>
          </section>

          <section>
            <h3>Apariencia</h3>
            <span className="settings-field-label">Piezas</span>
            <div className="piece-skin-picker" role="radiogroup" aria-label="Estilo de piezas">
              {PIECE_SKINS.map((skin) => {
                const unlocked = availableSkinIds.has(skin.id);
                const preview = SKIN_PREVIEWS[skin.id];
                return (
                  <button key={skin.id} type="button" role="radio" aria-checked={pieceSkin === skin.id} className={`piece-skin-option${pieceSkin === skin.id ? ' is-selected' : ''}`} disabled={!unlocked} onClick={() => updatePieceSkin(skin.id)}>
                    <span className={`piece-skin-preview piece-skin-preview-${skin.id}`} aria-hidden="true"><img src={preview[0]} alt="" /><img src={preview[1]} alt="" /></span>
                    <span><b>{unlocked ? skin.label : `🔒 ${skin.label}`}</b><small>{unlocked ? skin.description : `Se desbloquea en Torneo · nivel ${skin.level}`}</small></span>
                  </button>
                );
              })}
            </div>
          </section>

          {onBoard3D && <section>
            <h3>Experimentos</h3>
            <div className="settings-inline-action"><div><strong>Tablero 3D</strong><small>Vista experimental independiente del tablero principal.</small></div><button type="button" className="secondary-btn" onClick={onBoard3D}>Abrir</button></div>
          </section>}
        </div>
      </section>
    </div>
  );
}
