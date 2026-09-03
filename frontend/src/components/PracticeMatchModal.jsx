import { useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { difficultyForPracticeRating } from '../practiceDifficulty.js';
import ColorSelector from './ColorSelector.jsx';
import { TIME_CONTROLS } from '../clock.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

function colorLabel(color) {
  if (color === 'w' || color === 'white') return 'Blancas';
  if (color === 'b' || color === 'black') return 'Negras';
  return 'Aleatorio';
}

export default function PracticeMatchModal({
  color,
  setColor,
  timeControlId,
  setTimeControlId,
  loading,
  error = null,
  rating,
  onStart,
  onClose,
}) {
  useEscapeToClose(onClose);
  const adaptiveLevel = difficultyForPracticeRating(rating?.rating ?? 400, null, rating?.games ?? 0);
  const [autoDifficulty, setAutoDifficulty] = useState(true);
  const [difficulty, setDifficulty] = useState(adaptiveLevel);
  const selectedDifficulty = autoDifficulty ? adaptiveLevel : difficulty;
  const timeControl = TIME_CONTROLS.find((tc) => tc.id === timeControlId) || TIME_CONTROLS[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card friendly-modal" role="dialog" aria-modal="true" aria-label="Configurar partida de práctica" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Partida de práctica</span>
        <h3>Entrena sin jugarte el rating</h3>
        <p className="hint-text friendly-lead">Pistas gratuitas, cero premio y cero penalización ELO. Aquí vienes a probar cosas sin que Matthias cobre peaje estadístico.</p>

        <button type="button" className={`adaptive-difficulty-choice ${autoDifficulty ? 'active' : ''}`} aria-pressed={autoDifficulty} onClick={() => setAutoDifficulty(!autoDifficulty)}>
<span aria-hidden="true">◎</span>
<span><b>Adaptativo suave</b><small>Parte de tu nivel y baja un pequeño escalón para favorecer práctica útil · nivel {adaptiveLevel} · {difficultyLabel(adaptiveLevel)}</small></span>
<i>{autoDifficulty ? 'Activo' : 'Usar'}</i>
        </button>

        <div className={`difficulty-slider-row friendly-difficulty-main ${autoDifficulty ? 'is-disabled' : ''}`}>
<input
  type="range"
  min="0"
  max="100"
  value={selectedDifficulty}
  disabled={autoDifficulty}
  onChange={(event) => setDifficulty(Number(event.target.value))}
  aria-label="Nivel de dificultad de práctica"
  className="difficulty-slider"
/>
<div className="difficulty-readout">
  <span className="difficulty-number">{selectedDifficulty}</span>
  <span className="difficulty-word">{autoDifficulty ? 'Adaptativo suave' : difficultyLabel(difficulty)}</span>
</div>
        </div>

        {autoDifficulty && <button type="button" className="text-action adaptive-manual-link" onClick={() => setAutoDifficulty(false)}>Elegir nivel manualmente</button>}

        {error && <p className="quick-match-error" role="alert">{error}</p>}

        <button
type="button"
className="primary-btn friendly-main-cta"
disabled={loading}
onClick={() => onStart({ difficulty: selectedDifficulty, adaptiveDifficulty: autoDifficulty })}
        >
{loading ? 'Creando práctica…' : 'Empezar práctica'}
        </button>

        <details className="friendly-disclosure quick-match-settings">
<summary>Ajustes · {colorLabel(color)} · {timeControl?.label || 'Sin reloj'}</summary>
<div className="friendly-disclosure-body">
  <div className="quick-match-secondary-row">
    <ColorSelector value={color} onChange={setColor} />
    <select
      value={timeControlId}
      onChange={(event) => setTimeControlId(event.target.value)}
      className="time-control-select quick-match-clock-select"
      aria-label="Ritmo de reloj de práctica"
    >
      {TIME_CONTROLS.map((tc) => <option key={tc.id} value={tc.id}>{tc.label}</option>)}
    </select>
  </div>
</div>
        </details>
      </div>
    </div>
  );
}
