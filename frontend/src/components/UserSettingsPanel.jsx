import { useState } from 'react';
import { TIME_CONTROLS } from '../clock.js';
import { getAmbientVolume, isFxMuted, isMusicMuted, setAmbientVolume, setFxMuted, setMusicMuted } from '../sound.js';
import { getBoardCoordinates, getDefaultTimeControlId, getReducedMotionPreference, getUiLanguage, reducedMotionStatus, setBoardCoordinates, setDefaultTimeControlId, setReducedMotionPreference, setUiLanguage, SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
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
import { GENERATED_SKIN_PREVIEWS } from '../generatedPieceSkins.js';

const SKIN_PREVIEWS = {
  default: [pixelWhiteKnight, pixelBlackKnight],
  studio: [studioWhiteKnight, studioBlackKnight],
  azul: [blueWhiteKnight, blueBlackKnight],
  esmeralda: [emeraldWhiteKnight, emeraldBlackKnight],
  ...GENERATED_SKIN_PREVIEWS,
};

function motionStatusCopy(status) {
  if (status.preference === 'allow' && status.systemReduced) {
    return 'Animaciones activas: Chess Studio ignora la petición de movimiento reducido de este dispositivo.';
  }
  if (status.preference === 'allow') return 'Animaciones activas en este dispositivo.';
  if (status.preference === 'reduce') return 'Animaciones reducidas por Chess Studio.';
  if (status.systemReduced) return 'Sistema: el sistema o navegador solicita reducir movimiento; Matthias y otras animaciones permanecen quietas.';
  return 'Sistema: las animaciones están activas.';
}

export default function UserSettingsPanel({ onClose, onBoard3D, isAdminUser = false }) {
  useEscapeToClose(onClose);
  const [timeControlId, setTimeControlIdState] = useState(() => getDefaultTimeControlId());
  const [language, setLanguageState] = useState(() => getUiLanguage());
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => getAmbientVolume());
  const [pieceSkin, setPieceSkin] = useState(() => loadSelectedSkin());
  const [motionPreference, setMotionPreferenceState] = useState(() => getReducedMotionPreference());
  const [boardCoordinates, setBoardCoordinatesState] = useState(() => getBoardCoordinates());
  const tournamentLevel = levelForPoints(loadTournament().progressPoints || 0);
  const availableSkinIds = new Set(unlockedSkins(tournamentLevel, { isAdmin: isAdminUser }).map((skin) => skin.id));
  const motionStatus = reducedMotionStatus();

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
  function updateMotionPreference(value) {
    setMotionPreferenceState(setReducedMotionPreference(value));
  }

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-panel-heading">
          <div><span className="section-label">Preferencias</span><h2 id="settings-title">Ajustes</h2></div>
          <button type="button" className="secondary-btn" onClick={onClose}>Cerrar</button>
        </div>

        <div className="settings-sections">
          <section className="settings-appearance-featured">
            <div className="settings-section-intro"><span className="section-label">Tu mesa</span><h3>Apariencia del juego</h3><small>{isAdminUser ? 'Catálogo completo disponible para pruebas de administración.' : 'Elige una skin y comprueba el resultado directamente en el mini-tablero.'}</small></div>
            <div className="piece-skin-picker" role="radiogroup" aria-label="Estilo de piezas">
              {PIECE_SKINS.map((skin) => {
                const unlocked = availableSkinIds.has(skin.id);
                const preview = SKIN_PREVIEWS[skin.id];
                return (
                  <button key={skin.id} type="button" role="radio" aria-checked={pieceSkin === skin.id} className={`piece-skin-option${pieceSkin === skin.id ? ' is-selected' : ''}`} disabled={!unlocked} onClick={() => updatePieceSkin(skin.id)}>
                    <span className={`piece-skin-preview piece-skin-preview-${skin.id}`} aria-hidden="true"><span><img src={preview[0]} alt="" /></span><span><img src={preview[1]} alt="" /></span><span /><span /></span>
                    <span><b>{unlocked ? skin.label : `🔒 ${skin.label}`}</b><small>{unlocked ? skin.description : `Se desbloquea en Torneo · nivel ${skin.level}`}</small></span>
                    {pieceSkin === skin.id && <span className="piece-skin-selected-label">Seleccionada</span>}
                  </button>
                );
              })}
            </div>
            <label className="settings-toggle"><input type="checkbox" checked={boardCoordinates} onChange={(event) => setBoardCoordinatesState(setBoardCoordinates(event.target.checked))} /><span>Mostrar coordenadas del tablero</span></label>
            <label className="settings-field">
              <span>Animaciones</span>
              <select value={motionPreference} onChange={(event) => updateMotionPreference(event.target.value)} aria-label="Preferencia de animaciones">
                <option value="system">Sistema</option>
                <option value="allow">Animaciones activas</option>
                <option value="reduce">Reducir animaciones</option>
              </select>
            </label>
            <small data-motion-effective={motionStatus.effective ? 'reduced' : 'active'}>{motionStatusCopy(motionStatus)}</small>
          </section>
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

          {onBoard3D && <section>
            <h3>Experimentos</h3>
            <div className="settings-inline-action"><div><strong>Tablero 3D</strong><small>Vista experimental independiente del tablero principal.</small></div><button type="button" className="secondary-btn" onClick={onBoard3D}>Abrir</button></div>
          </section>}
        </div>
      </section>
    </div>
  );
}
