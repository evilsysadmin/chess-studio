import { useState } from 'react';
import { buildInsightsPositionAutopsy } from '../puzzleReveal.js';
import InsightsPositionPreview from './InsightsPositionPreview.jsx';

// This is an explicit spoiler. It never mutates the personal training state.
export default function InsightsPositionAutopsy({ puzzle, fen }) {
  const review = puzzle ? buildInsightsPositionAutopsy(puzzle) : null;
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState('before');
  const active = revealed ? review?.views.find((view) => view.id === selected) : null;
  const view = active || review?.views[0] || null;

  return (
    <>
      <InsightsPositionPreview fen={view?.fen || fen} orientation={review?.orientation} move={active?.move} />
      {review ? (
        <div className="insights-position-autopsy" data-autopsy-revealed={revealed ? 'true' : 'false'}>
          {!revealed ? (
            <button type="button" className="insights-position-autopsy-open" onClick={() => setRevealed(true)}>
              Abrir autopsia <span>· revela la solución</span>
            </button>
          ) : (
            <>
              <div className="insights-position-autopsy-nav" role="group" aria-label="Comparar jugadas reales">
                {review.views.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={view.id === item.id}
                    className={view.id === item.id ? 'is-selected' : ''}
                    onClick={() => setSelected(item.id)}
                  >{item.label}</button>
                ))}
              </div>
              <p className="insights-position-autopsy-fact" role="status">
                {view.id === 'before'
                  ? 'La posición antes de decidir. Ambas jugadas se reconstruyen desde aquí.'
                  : view.id === 'played'
                    ? 'Jugaste ' + view.move.san + '. El movimiento se reconstruye desde la partida.'
                    : 'Alternativa validada para entrenar: ' + view.move.san + '.'}
              </p>
              <small>El análisis registró una pérdida aproximada de {review.lossCp} cp. Resolver el ejercicio no demuestra una mejora futura.</small>
              <button type="button" className="insights-position-autopsy-close" onClick={() => { setRevealed(false); setSelected('before'); }}>
                Ocultar autopsia
              </button>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
