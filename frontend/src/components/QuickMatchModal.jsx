import React from 'react';
import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { TIME_CONTROLS } from '../clock.js';
import { SERIES_OPTIONS } from '../series.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { handicapForGap } from '../handicap.js';

export default function QuickMatchModal({
  difficulty,
  setDifficulty,
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Partida rápida</span>
        <h3>Elige tu rival</h3>
        <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
          El ritmo elegido también se usa en "Partida de práctica". Las series son sólo para Partida rápida; Torneo y Combate tienen su propia configuración.
        </p>

        <div className="difficulty-slider-row">
          <input
            type="range"
            min="0"
            max="100"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            aria-label="Nivel de dificultad de la CPU"
            className="difficulty-slider"
          />
          <div className="difficulty-readout">
            <span className="difficulty-number">{difficulty}</span>
            <span className="difficulty-word">{difficultyLabel(difficulty)}</span>
          </div>
        </div>

        {handicap && (
          <p className="hint-text" style={{ marginTop: '0.5rem', color: 'var(--hint)' }}>
            Con tu rating actual, esta dificultad es un buen salto — la CPU va a jugar <b>{handicap.label.toLowerCase()}</b>, para
            compensar la brecha.
          </p>
        )}

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
            La dificultad y el reloj se mantienen durante la serie. El color alterna en cada partida.
          </p>
        )}

        <div className="quick-match-advanced">
          <label><input type="checkbox" checked={suddenDeath} onChange={(e)=>setSuddenDeath(e.target.checked)} /> <b>Sudden Death</b> · 3 incidentes tácticos graves y pierdes, aunque el tablero aún respire.</label>
          <label><input type="checkbox" checked={threatCheck} onChange={(e)=>setThreatCheck(e.target.checked)} /> <b>Control táctico</b> · ante una cagada seria, la CPU espera y te obliga a preguntarte qué amenaza el rival.</label>
        </div>

        <button
          type="button"
          className="primary-btn"
          style={{ width: '100%', marginTop: '1rem' }}
          disabled={loading}
          onClick={onStart}
        >
          {loading ? 'Creando partida…' : 'Empezar partida'}
        </button>
      </div>
    </div>
  );
}
