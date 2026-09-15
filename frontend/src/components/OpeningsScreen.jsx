import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import PreferredBoard from './PreferredBoard.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { OPENING_LESSONS } from '../openings-data.js';
import { orderOpeningLessons } from '../openingLessonOrder.js';
import './OpeningsScreen.css';

const OPENING_FAMILIES = [
  {
    key: 'e4',
    move: '1.e4',
    title: 'Peón de rey',
    note: 'Aperturas abiertas, defensas semiabiertas y pelea inmediata por el centro.',
    matches: (opening) => opening.moves[0] === 'e4',
  },
  {
    key: 'd4',
    move: '1.d4',
    title: 'Peón de dama',
    note: 'Estructura, presión y familias indias: el centro se disputa con más paciencia.',
    matches: (opening) => opening.moves[0] === 'd4',
  },
  {
    key: 'flank',
    move: 'Flanco',
    title: 'Otros comienzos',
    note: 'Entradas laterales y flexibles que retrasan la definición del centro.',
    matches: (opening) => opening.moves[0] !== 'e4' && opening.moves[0] !== 'd4',
  },
];

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

  const openingFamilies = useMemo(() => {
    const ordered = orderOpeningLessons(OPENING_LESSONS);
    return OPENING_FAMILIES.map((family) => ({
      ...family,
      openings: ordered.filter(family.matches),
    })).filter((family) => family.openings.length > 0);
  }, []);

  if (selected) {
    return <OpeningDetail opening={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="menu openings-library-screen">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section openings-library-shell">
        <header className="openings-library-header">
          <span className="section-label">Aprender · Archivo de aperturas</span>
          <h2>Aperturas famosas</h2>
          <p className="hero-scope-note">
            Dieciocho aperturas clásicas ordenadas por familia. Elige una línea y recórrela jugada a jugada sobre el tablero.
          </p>
        </header>

        <div className="openings-family-index" aria-label="Familias de aperturas">
          {openingFamilies.map((family) => (
            <span key={family.key}>
              <b>{family.move}</b>
              <small>{family.openings.length} líneas</small>
            </span>
          ))}
        </div>

        <div className="openings-ledger">
          {openingFamilies.map((family) => (
            <section key={family.key} className="openings-family" aria-labelledby={`opening-family-${family.key}`}>
              <header className="openings-family-heading">
                <span className="openings-family-move" aria-hidden="true">{family.move}</span>
                <div>
                  <h3 id={`opening-family-${family.key}`}>{family.title}</h3>
                  <p>{family.note}</p>
                </div>
              </header>

              <div className="openings-volume-list">
                {family.openings.map((opening, index) => (
                  <button
                    key={opening.key}
                    type="button"
                    className="openings-volume"
                    onClick={() => setSelected(opening)}
                    aria-label={`Abrir ${opening.title}`}
                  >
                    <span className="openings-volume-index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="openings-volume-copy">
                      <strong>{opening.title}</strong>
                      <small>{opening.intro}</small>
                    </span>
                    <code className="openings-volume-line">{opening.moves.join(' ')}</code>
                    <span className="openings-volume-cta">
                      {opening.moves.length} jugadas <b aria-hidden="true">→</b>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
