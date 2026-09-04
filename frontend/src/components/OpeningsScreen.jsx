import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import PreferredBoard from './PreferredBoard.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { OPENING_LESSONS } from '../openings-data.js';
import { orderOpeningLessons } from '../openingLessonOrder.js';

function OpeningDetail({ opening, onBack }) {
  useEscapeToClose(onBack);
  const [moveStep, setMoveStep] = useState(0);

  const positions = useMemo(() => {
    const chess = new Chess();
    const list = [chess.fen()];
    for (const san of opening.moves) {
      chess.move(san);
      list.push(chess.fen());
    }
    return list;
  }, [opening]);

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onBack}>← Volver a aperturas</button>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <div className="board-column">
          <PreferredBoard fen={positions[moveStep]} />
          <div className="game-controls">
            <button className="secondary-btn" onClick={() => setMoveStep((s) => Math.max(0, s - 1))} disabled={moveStep === 0}>
              ← Jugada anterior
            </button>
            <button
              className="secondary-btn"
              onClick={() => setMoveStep((s) => Math.min(opening.moves.length, s + 1))}
              disabled={moveStep === opening.moves.length}
            >
              Jugada siguiente →
            </button>
          </div>
        </div>

        <div className="tutorial-text">
          <span className="eyebrow">Apertura famosa</span>
          <h2>{opening.title}</h2>
          <p className="hint-text" style={{ marginBottom: '0.6rem' }}>
            Jugada {moveStep} de {opening.moves.length}
            {moveStep > 0 ? ` — ${opening.moves[moveStep - 1]}` : ' — posición inicial'}
          </p>
          <p>{moveStep === 0 ? opening.intro : opening.moveNotes[moveStep - 1]}</p>
        </div>
      </div>
    </div>
  );
}

export default function OpeningsScreen({ onExit }) {
  useEscapeToClose(onExit);
  const [selected, setSelected] = useState(null);

  if (selected) {
    return <OpeningDetail opening={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Aprender</span>
        <h2>Aperturas famosas</h2>
        <p className="hero-scope-note">
          Dieciocho aperturas clásicas, recorridas jugada por jugada con explicación en cada una.
        </p>
        <div className="menu-grid menu-grid-2">
          {orderOpeningLessons(OPENING_LESSONS).map((op) => (
            <button key={op.key} type="button" className="menu-card accent-hint" onClick={() => setSelected(op)}>
              <h3>{op.title}</h3>
              <p>{op.intro}</p>
              <span className="menu-card-cta">{op.moves.length} jugadas →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
