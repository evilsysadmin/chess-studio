import React from 'react';
import { difficultyLabel } from '../difficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { TIME_CONTROLS } from '../clock.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { handicapForGap } from '../handicap.js';

export default function QuickMatchModal({
  difficulty,
  setDifficulty,
  color,
  setColor,
  timeControlId,
  setTimeControlId,
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
          También se aplica a "Partida de práctica" — Torneo y Combate tienen su propia configuración.
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
