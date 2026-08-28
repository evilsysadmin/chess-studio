import { difficultyLabel } from '../difficulty.js';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';

// Agrupa el historial (lista plana de jugadas) en pares [blancas, negras] por turno.
function toPairs(history) {
  const pairs = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
    });
  }
  return pairs;
}

export default function NotationPanel({ history, difficulty }) {
  const pairs = toPairs(history);
  const opening = identifyOpening(history.map((m) => m.san));

  return (
    <aside className="notation-panel">
      <h3>Cuaderno de jugadas</h3>
      {opening && <p className="opening-tag">{opening}</p>}
      <div className="notation-list">
        {pairs.length === 0 && <p className="notation-empty">Todavía no se movió ninguna pieza.</p>}
        {pairs.map((p) => (
          <div className="notation-row" key={p.num}>
            <span className="num">{p.num}.</span>
            <span className="white-move" title={p.white?.san}>{p.white ? formatLongMove(p.white) : ''}</span>
            <span className="black-move" title={p.black?.san}>{p.black ? formatLongMove(p.black) : ''}</span>
          </div>
        ))}
      </div>
      <div className="difficulty-tag">
        CPU · nivel <b>{difficulty}</b> · {difficultyLabel(difficulty)}
      </div>
    </aside>
  );
}
