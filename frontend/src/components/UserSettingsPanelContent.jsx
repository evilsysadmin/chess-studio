import { useState } from 'react';
import { TIME_CONTROLS } from '../clock.js';
import { getAmbientVolume, isFxMuted, isMusicMuted, setAmbientVolume, setFxMuted, setMusicMuted } from '../sound.js';
import { BOARD_RENDERERS, getBoardCoordinates, getBoardRenderer, getDefaultTimeControlId, getReducedMotion, getUiLanguage, setBoardCoordinates, setBoardRenderer, setDefaultTimeControlId, setReducedMotion, setUiLanguage, SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
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
import './UserSettingsBoardRenderer.css';

const SKIN_PREVIEWS = {
  default: [pixelWhiteKnight, pixelBlackKnight],
  studio: [studioWhiteKnight, studioBlackKnight],
  azul: [blueWhiteKnight, blueBlackKnight],
  esmeralda: [emeraldWhiteKnight, emeraldBlackKnight],
  ...GENERATED_SKIN_PREVIEWS,
};

export default function UserSettingsPanelContent({ onClose, onBoard3D, isAdminUser = false }) {
  const [timeControlId, setTimeControlIdState] = useState(() => getDefaultTimeControlId());
  const [language, setLanguageState] = useState(() => getUiLanguage());
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => getAmbientVolume());
  const [pieceSkin, setPieceSkin] = useState(() => loadSelectedSkin());
  const [boardRenderer, setBoardRendererState] = useState(() => getBoardRenderer());
  const [reducedMotion, setReducedMotionState] = useState(() => getReducedMotion());
  const [boardCoordinates, setBoardCoordinatesState] = useState(() => getBoardCoordinates());
  const tournamentLevel = levelForPoints(loadTournament().progressPoints || 0);
  const availableSkinIds = new Set(unlockedSkins(tournamentLevel, { isAdmin: isAdminUser }).map((skin) => skin.id));

  function closeSettings() {
    // Cambiar 2D/3D puede montar o desmontar Three.js. Lo aplicamos después de
    // cerrar el modal para que el propio cambio de renderer no mueva el botón
    // Cerrar bajo el dedo, especialmente en Android/WebView.
    if (boardRenderer !== getBoardRenderer()) setBoardRenderer(boardRenderer);
    onClose?.();
  }

  useEscapeToClose(closeSettings);

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
  function updateBoardRenderer(id) {
    const normalized = BOARD_RENDERERS.some((renderer) => renderer.id === id) ? id : '2d';
    setBoardRendererState(normalized);
  }

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSettings(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-panel-heading">
          <div><span className="section-label">Preferencias</span><h2 id="settings-title">Ajustes</h2></div>
          <button type="button" className="secondary-btn" onClick={closeSettings}>Cerrar</button>
        </div>

        <div className="settings-sections">
          <section className="settings-appearance-featured">
            <div className="settings-section-intro"><span className="section-label">Tu mesa</span><h3>Apariencia del juego</h3><small>{isAdminUser ? 'Catálogo completo disponible para pruebas de administración.' : 'Elige cómo se representa el tablero y después la estética de tus piezas.'}</small></div>

            <div className="settings-board-renderer" role="radiogroup" aria-label="Representación del tablero">
              <div className="settings-board-renderer-copy">
                <strong>Tablero principal</strong>
                <small>{boardRenderer === '3d' ? 'Perspectiva 3D fija desde tu lado. No gira ni se arrastra durante la partida.' : 'Vista 2D clásica, plana y directa.'}</small>
              </div>
              <div className="settings-board-renderer-options">
                {BOARD_RENDERERS.map((renderer) => (
                  <button
                    key={renderer.id}
                    type="button"
                    role="radio"
                    aria-checked={boardRenderer === renderer.id}
                    className={`secondary-btn settings-renderer-option${boardRenderer === renderer.id ? ' is-selected' : ''}`}
                    onClick={() => updateBoardRenderer(renderer.id)}
                  >
                    {renderer.id === '3d' ? '◈ ' : '▦ '}{renderer.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="piece-skin-picker" role="radiogroup" aria-label="Estilo de piezas">
              {PIECE_SKINS.map((skin) => {
                const unlocked = availableSkinIds.has(skin.id);
                const preview = SKIN_PREVIEWS[skin.id];
                return (
                  <button key={skin.id} type="button" role="radio" aria-checked={pieceSkin === skin.id} className={`piece-skin-option${pieceSkin === skin.id ? ' is-selected' : ''}`} disabled={!unlocked} onClick={() => updatePieceSkin(skin.id)}>
                    <span className={`piece-skin-preview piece-skin-preview-${skin.id}`} aria-hidden="true"><span><img src={preview[0]} alt="" /></span><span><img src={preview[1]} alt="" /></span><span /><span /></span>
                    <span><b>{unlocked ? skin.label : `🔒 ${skin.label}`}</b><small>{unlocked ? `${skin.description}${boardRenderer === '3d' ? ' · Adaptada a materiales 3D.' : ''}` : `Se desbloquea en Torneo · nivel ${skin.level}`}</small></span>
                    {pieceSkin === skin.id && <span className="piece-skin-selected-label">Seleccionada</span>}
                  </button>
                );
              })}
            </div>
            <label className="settings-toggle"><input type="checkbox" checked={boardCoordinates} onChange={(event) => setBoardCoordinatesState(setBoardCoordinates(event.target.checked))} /><span>Mostrar coordenadas del tablero</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotionState(setReducedMotion(event.target.checked))} /><span>Reducir animaciones</span></label>
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

          {isAdminUser && onBoard3D && <section>
            <h3>Laboratorio</h3>
            <div className="settings-inline-action"><div><strong>Prototipo 3D aislado</strong><small>Se conserva para comparar el prototipo histórico con el nuevo tablero principal.</small></div><button type="button" className="secondary-btn" onClick={onBoard3D}>Abrir lab</button></div>
          </section>}
        </div>
      </section>
    </div>
  );
}
