import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { TIME_CONTROLS } from '../clock.js';
import { SERIES_OPTIONS } from '../series.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { handicapForGap } from '../handicap.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { difficultyForRating } from '../playerRating.js';

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
  rating,
  onStart,
  onClose,
}) {
  useEscapeToClose(onClose);
  const handicap = rating ? handicapForGap(rating.rating, difficulty) : null;
  const adaptiveLevel = difficultyForRating(rating?.rating ?? 400);
  const timeControl = TIME_CONTROLS.find((tc) => tc.id === timeControlId) || TIME_CONTROLS[0];
  const series = SERIES_OPTIONS.find((option) => Number(option.value) === Number(seriesBestOf)) || SERIES_OPTIONS[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card friendly-modal" role="dialog" aria-modal="true" aria-label="Configurar partida rápida" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Partida rápida</span>
        <div className="combat-heading-row"><h3>Elige dificultad y juega</h3><MechanicTutorialHelp tutorialId="quick-match-rules" /></div>
        <p className="hint-text friendly-lead">Puedes dejar todo lo demás en automático.</p>

        <button type="button" className={`adaptive-difficulty-choice ${autoDifficulty ? 'active' : ''}`} aria-pressed={autoDifficulty} onClick={() => setAutoDifficulty(!autoDifficulty)}>
          <span aria-hidden="true">◎</span><span><b>Encuentra mi nivel</b><small>Ajusta la CPU a tu rating actual · nivel {adaptiveLevel} · {difficultyLabel(adaptiveLevel)}</small></span><i>{autoDifficulty ? 'Activo' : 'Usar'}</i>
        </button>

        <div className={`difficulty-slider-row friendly-difficulty-main ${autoDifficulty ? 'is-disabled' : ''}`}>
          <input
            type="range"
            min="0"
            max="100"
            value={autoDifficulty ? adaptiveLevel : difficulty}
            disabled={autoDifficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            aria-label="Nivel de dificultad de la CPU"
            className="difficulty-slider"
          />
          <div className="difficulty-readout">
            <span className="difficulty-number">{autoDifficulty ? adaptiveLevel : difficulty}</span>
            <span className="difficulty-word">{autoDifficulty ? 'Automático' : difficultyLabel(difficulty)}</span>
          </div>
        </div>

        {autoDifficulty && <button type="button" className="text-action adaptive-manual-link" onClick={() => setAutoDifficulty(false)}>Elegir nivel manualmente</button>}

        {!autoDifficulty && handicap && (
          <p className="hint-text friendly-inline-note">
            Ajuste recomendado: <b>{handicap.label.toLowerCase()}</b> para compensar la diferencia de rating.
          </p>
        )}

        <button
          type="button"
          className="primary-btn friendly-main-cta"
          disabled={loading}
          onClick={onStart}
        >
          {loading ? 'Creando partida…' : 'Empezar partida'}
        </button>

        <details className="friendly-disclosure quick-match-settings">
          <summary>
            Ajustes · {colorLabel(color)} · {timeControl?.label || 'Sin reloj'} · {series?.label || 'Una partida'}
          </summary>
          <div className="friendly-disclosure-body">
            <div className="quick-match-secondary-row">
              <ColorSelector value={color} onChange={setColor} />
              <select
                value={timeControlId}
                onChange={(e) => setTimeControlId(e.target.value)}
                className="time-control-select quick-match-clock-select"
                aria-label="Ritmo de reloj"
              >
                {TIME_CONTROLS.map((tc) => (
                  <option key={tc.id} value={tc.id}>{tc.label}</option>
                ))}
              </select>
              <select
                value={seriesBestOf}
                onChange={(e) => setSeriesBestOf(Number(e.target.value))}
                className="time-control-select quick-match-series-select"
                aria-label="Formato de serie"
              >
                {SERIES_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {seriesBestOf > 1 && (
              <p className="hint-text" style={{ marginTop: '0.65rem' }}>
                La dificultad y el reloj se mantienen; el color alterna en cada partida.
              </p>
            )}

            <details className="friendly-subdisclosure">
              <summary>Reglas especiales</summary>
              <div className="quick-match-advanced friendly-advanced-options">
                <label><input type="checkbox" checked={suddenDeath} onChange={(e)=>setSuddenDeath(e.target.checked)} /> <b>Sudden Death</b> · 3 incidentes tácticos graves y pierdes.</label>
                <label><input type="checkbox" checked={threatCheck} onChange={(e)=>setThreatCheck(e.target.checked)} /> <b>Control táctico</b> · ante un error grave, la CPU te pide identificar controles, capturas y amenazas.</label>
              </div>
            </details>
          </div>
        </details>
      </div>
    </div>
  );
}
