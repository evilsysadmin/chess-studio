import { Suspense, lazy, useEffect, useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { TIME_CONTROLS } from '../clock.js';
import { SERIES_OPTIONS } from '../series.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { handicapForGap } from '../handicap.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { adaptiveDifficultyPresentation } from '../adaptiveDifficultyPresentation.js';
import { fetchMatthiasBriefing } from '../matthiasDaily.js';
import { matthiasTimeVisual } from '../matthiasVisuals.js';
import './QuickMatchMobileGoldenPath.css';
import './QuickMatchReadyRoom.css';
import { preloadBoard3DRenderer } from './Board3DRegistration.js';
import { loadWarRoomVariant, prefetchWarRoomVariant } from './WarRoomVariant.js';
import {
  exitWarRoomBrowserFullscreen,
  requestWarRoomLandscapeOnEntry,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

const QuickMatchReadyRoomScene3D = lazy(() => import('./QuickMatchReadyRoomScene3D.jsx'));

const QUICK_MATCH_TOUCH_TARGET = Object.freeze({ minHeight: 44, touchAction: 'manipulation' });
const QUICK_MATCH_ICON_TARGET = Object.freeze({ minWidth: 44, minHeight: 44, touchAction: 'manipulation' });

function colorLabel(color) {
  if (color === 'w' || color === 'white') return 'Blancas';
  if (color === 'b' || color === 'black') return 'Negras';
  return 'Aleatorio';
}

export default function QuickMatchModal({
  difficulty,
  setDifficulty,
  autoDifficulty,
  setAutoDifficulty,
  color,
  setColor,
  timeControlId,
  setTimeControlId,
  seriesBestOf,
  setSeriesBestOf,
  suddenDeath,
  setSuddenDeath,
  threatCheck,
  setThreatCheck,
  loading,
  error = null,
  rating,
  boardRenderer = '3d',
  onStart,
  onClose,
}) {
  useEscapeToClose(onClose);
  const handicap = rating ? handicapForGap(rating.rating, difficulty) : null;
  const adaptive = adaptiveDifficultyPresentation(rating);
  const timeControl = TIME_CONTROLS.find((tc) => tc.id === timeControlId) || TIME_CONTROLS[0];
  const series = SERIES_OPTIONS.find((option) => Number(option.value) === Number(seriesBestOf)) || SERIES_OPTIONS[0];
  const [matthiasBriefing, setMatthiasBriefing] = useState(null);
  const [selectedRenderer, setSelectedRenderer] = useState(boardRenderer === '2d' ? '2d' : '3d');
  const matthiasVisual = matthiasTimeVisual();

  useEffect(() => {
    if (selectedRenderer !== '3d') return undefined;
    void Promise.allSettled([
      preloadBoard3DRenderer(),
      prefetchWarRoomVariant(loadWarRoomVariant()),
    ]);
    return undefined;
  }, [selectedRenderer]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetchMatthiasBriefing({ signal: controller.signal })
      .then((result) => { if (active && result?.text) setMatthiasBriefing(result.text); })
      .catch(() => { if (active) setMatthiasBriefing(null); });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function startQuickMatch() {
    const autoRotate = selectedRenderer === '3d'
      ? await requestWarRoomLandscapeOnEntry()
      : false;
    const started = await onStart({ boardRenderer: selectedRenderer });
    if (!started && autoRotate) {
      void exitWarRoomBrowserFullscreen();
      unlockWarRoomOrientation();
    }
  }

  const opponentLabel = autoDifficulty
    ? 'Matthias · ajuste automático'
    : `Matthias · nivel ${difficulty} ${difficultyLabel(difficulty)}`;

  return (
    <div className="modal-backdrop quick-match-ready-room-backdrop" onClick={onClose}>
      <section
        className="army-card friendly-modal quick-match-ready-room"
        role="dialog"
        aria-modal="true"
        aria-label="Configurar partida rápida"
        onClick={(event) => event.stopPropagation()}
      >
        <Suspense fallback={null}>
          <QuickMatchReadyRoomScene3D />
        </Suspense>
        <div className="quick-match-ready-room__shade" aria-hidden="true" />

        <button
          className="piece-info-close quick-match-ready-room__close"
          style={QUICK_MATCH_ICON_TARGET}
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="quick-match-ready-room__content">
          <header className="quick-match-ready-room__heading">
            <span className="eyebrow">Castillo · Antesala de la War Room</span>
            <div className="combat-heading-row">
              <h3>Matthias te espera.</h3>
              <MechanicTutorialHelp tutorialId="quick-match-rules" />
            </div>
            <p className="hint-text friendly-lead">
              Todo está listo con tus valores por defecto. Juega ya o cambia sólo lo que quieras.
            </p>
          </header>

          {matthiasBriefing && (
            <aside className="matthias-quick-briefing quick-match-ready-room__briefing" aria-label="Briefing de Matthias">
              <img src={matthiasVisual.avatar} alt="" aria-hidden="true" />
              <div>
                <span>MATTHIAS // {matthiasVisual.label}</span>
                <p>{matthiasBriefing}</p>
              </div>
            </aside>
          )}

          <div className="quick-match-ready-room__launch">
            <div className="quick-match-ready-room__defaults" aria-label="Configuración actual">
              <span><small>Rival</small><b>{opponentLabel}</b></span>
              <span><small>Color</small><b>{colorLabel(color)}</b></span>
              <span><small>Reloj</small><b>{timeControl?.label || 'Sin reloj'}</b></span>
              {seriesBestOf > 1 && <span><small>Serie</small><b>{series?.label}</b></span>}
            </div>

            {error && <p className="quick-match-error" role="alert">{error}</p>}

            <button
              type="button"
              className="primary-btn friendly-main-cta quick-match-ready-room__play"
              style={QUICK_MATCH_TOUCH_TARGET}
              disabled={loading}
              onClick={() => { void startQuickMatch(); }}
            >
              {loading ? 'Preparando la War Room…' : 'Empezar partida'}
            </button>

            <details className="friendly-disclosure quick-match-settings quick-match-ready-room__settings">
              <summary style={QUICK_MATCH_TOUCH_TARGET}>Ajustar partida</summary>
              <div className="friendly-disclosure-body quick-match-ready-room__settings-body">
                <section className="quick-match-ready-room__setting-group" aria-labelledby="quick-match-rival-setting">
                  <div className="quick-match-ready-room__setting-heading">
                    <span id="quick-match-rival-setting">Rival</span>
                    <small>{autoDifficulty ? 'Recomendado' : 'Manual'}</small>
                  </div>

                  <button
                    type="button"
                    className={`adaptive-difficulty-choice ${autoDifficulty ? 'active' : ''}`}
                    aria-pressed={autoDifficulty}
                    onClick={() => setAutoDifficulty(!autoDifficulty)}
                  >
                    <span aria-hidden="true">◎</span>
                    <span>
                      <b>Jugar contra Matthias</b>
                      <small>{adaptive.choiceCopy}</small>
                    </span>
                    <i>{autoDifficulty ? 'Activo' : 'Usar'}</i>
                  </button>

                  {!autoDifficulty && (
                    <>
                      <div className="difficulty-slider-row friendly-difficulty-main">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={difficulty}
                          onChange={(event) => setDifficulty(Number(event.target.value))}
                          aria-label="Nivel de dificultad de la CPU"
                          className="difficulty-slider"
                        />
                        <div className="difficulty-readout">
                          <span className="difficulty-number">{difficulty}</span>
                          <span className="difficulty-word">{difficultyLabel(difficulty)}</span>
                        </div>
                      </div>
                      {handicap && (
                        <p className="hint-text friendly-inline-note">
                          Ajuste recomendado: <b>{handicap.label.toLowerCase()}</b> para compensar la diferencia de rating.
                        </p>
                      )}
                    </>
                  )}

                  {autoDifficulty && (
                    <details className="friendly-subdisclosure adaptive-difficulty-details">
                      <summary style={QUICK_MATCH_TOUCH_TARGET}>Cómo se ajusta Matthias</summary>
                      <div className="friendly-disclosure-body">
                        <p className="hint-text"><b>{adaptive.detailLabel}</b></p>
                        <p className="hint-text">{adaptive.evidenceCopy}</p>
                        <p className="hint-text">
                          Matthias sólo usa evidencia ya guardada antes de empezar. No cambia de fuerza durante la partida y, en una serie, mantiene el mismo nivel hasta terminar.
                        </p>
                      </div>
                    </details>
                  )}
                </section>

                <section className="quick-match-ready-room__setting-group" aria-labelledby="quick-match-board-setting">
                  <div className="quick-match-ready-room__setting-heading">
                    <span id="quick-match-board-setting">Mesa</span>
                    <small>Opcional</small>
                  </div>

                  <div className="quick-match-secondary-row">
                    <ColorSelector value={color} onChange={setColor} minTargetSize={44} />
                    <select
                      value={timeControlId}
                      onChange={(event) => setTimeControlId(event.target.value)}
                      className="time-control-select quick-match-clock-select"
                      style={QUICK_MATCH_TOUCH_TARGET}
                      aria-label="Ritmo de reloj"
                    >
                      {TIME_CONTROLS.map((tc) => (
                        <option key={tc.id} value={tc.id}>{tc.label}</option>
                      ))}
                    </select>
                    <select
                      value={seriesBestOf}
                      onChange={(event) => setSeriesBestOf(Number(event.target.value))}
                      className="time-control-select quick-match-series-select"
                      style={QUICK_MATCH_TOUCH_TARGET}
                      aria-label="Formato de serie"
                    >
                      {SERIES_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="quick-match-ready-room__renderer" role="group" aria-label="Tipo de tablero">
                    <span className="hint-text">Tablero</span>
                    {[
                      ['3d', '3D', 'War Room 3D'],
                      ['2d', '2D', 'Tablero 2D ligero · pixel art por defecto'],
                    ].map(([value, label, title]) => {
                      const selected = selectedRenderer === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className="secondary-btn"
                          disabled={loading}
                          aria-pressed={selected}
                          title={title}
                          onClick={() => setSelectedRenderer(value)}
                          style={{
                            minWidth: 48,
                            minHeight: 44,
                            padding: '.28rem .55rem',
                            fontSize: '.75rem',
                            opacity: selected ? 1 : .58,
                            borderColor: selected ? 'var(--brass)' : undefined,
                            color: selected ? 'var(--parchment)' : undefined,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {seriesBestOf > 1 && (
                    <p className="hint-text">
                      La dificultad y el reloj se mantienen; el color alterna en cada partida.
                    </p>
                  )}
                </section>

                <details className="friendly-subdisclosure">
                  <summary style={QUICK_MATCH_TOUCH_TARGET}>Reglas especiales</summary>
                  <div className="quick-match-advanced friendly-advanced-options">
                    <label style={QUICK_MATCH_TOUCH_TARGET}>
                      <input type="checkbox" checked={suddenDeath} onChange={(event) => setSuddenDeath(event.target.checked)} />
                      {' '}<b>Sudden Death</b> · 3 incidentes tácticos graves y pierdes.
                    </label>
                    <label style={QUICK_MATCH_TOUCH_TARGET}>
                      <input type="checkbox" checked={threatCheck} onChange={(event) => setThreatCheck(event.target.checked)} />
                      {' '}<b>Control táctico</b> · ante un error grave, la CPU te pide identificar controles, capturas y amenazas.
                    </label>
                  </div>
                </details>
              </div>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}
